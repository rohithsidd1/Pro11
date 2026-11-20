// Pro11 cricket data sync. Called by:
//   • the hourly database job (header x-sync-token) with { mode: "tick" }
//   • the admin app (signed-in admin) with { mode: "list" | "fixtures" | "squad" | "info", matchId? }
//   • a member who just joined a game with { mode: "squad-for-entry", matchId } (only fetches once per match)
// Every call to CricketData is checked against the daily credit cap and logged with its real cost.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, cors, json } from '../_shared/util.ts'
import { cbManual, tickCricbuzz } from './cricbuzz.ts'
import { groupByFields, parseMatch, parseSquad, parseXi, squadFieldNames, type MatchRow, type TeamRow } from '../_shared/cricket.ts'

const API = 'https://api.cricapi.com/v1'
// What we expect each call to cost. The API reports the real figure (info.hitsUsed) and we log that.
// Fantasy APIs (match_squad, match_scorecard, match_points) cost 10 on CricketData's free plan; list/info APIs cost 1.
const EXPECTED: Record<string, number> = { currentMatches: 1, matches: 1, match_info: 1, series_info: 1, series_squad: 1, match_squad: 10, match_scorecard: 10, match_points: 10 }

type Trigger = 'auto' | 'admin'
type DataSettings = {
  daily_credit_cap: number; list_refresh_hours: number; fixtures_refresh_hours: number; fixtures_pages: number
  sync_paused: boolean; last_list_sync_at: string | null; last_fixtures_sync_at: string | null
  auto_xi_check?: boolean
  fx_live_update?: boolean
  fx_ruleset?: number
  full_scorecard?: boolean
  live_scores?: boolean
  live_score_minutes?: number
}
interface Ctx { db: SupabaseClient; s: DataSettings; trigger: Trigger; last?: 'ok' | 'skipped' | 'error' | 'failure'; capHit?: boolean; lastInfo?: Record<string, unknown>; failures?: string[] }

const utcDay = () => new Date().toISOString().slice(0, 10)

interface Caller { trigger: Trigger; userId: string | null; isAdmin: boolean }

async function authorize(req: Request, db: SupabaseClient): Promise<Caller | null> {
  const token = req.headers.get('x-sync-token')
  if (token) {
    const { data } = await db.rpc('sync_token_ok', { p_token: token })
    return data === true ? { trigger: 'auto', userId: null, isAdmin: false } : null
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data: u } = await db.auth.getUser(jwt)
  if (!u?.user) return null
  const { data: p } = await db.from('profiles').select('role, blocked').eq('id', u.user.id).maybeSingle()
  if (!p || p.blocked) return null
  return { trigger: p.role === 'admin' ? 'admin' : 'auto', userId: u.user.id, isAdmin: p.role === 'admin' }
}

/** What a list call contained, for the admin's API log: "25 rows of 59 · 20 finished, 3 live, 2 to start". */
// deno-lint-ignore no-explicit-any
function describe(data: any, rows: number | null, info: Record<string, unknown>): string | null {
  // deno-lint-ignore no-explicit-any
  const list: any[] | null = Array.isArray(data) ? data : Array.isArray(data?.matchList) ? data.matchList : null
  const head = rows !== null ? `${rows} rows${info.totalRows ? ` of ${info.totalRows}` : ''}` : list ? `${list.length} matches in the series` : null
  if (!list?.length || !list.some((m) => m && ('matchStarted' in m || 'matchEnded' in m || 'dateTimeGMT' in m))) return head
  const ended = list.filter((m) => m?.matchEnded).length
  const live = list.filter((m) => m?.matchStarted && !m?.matchEnded).length
  const toStart = list.length - ended - live
  const fantasy = list.filter((m) => !m?.matchEnded && m?.fantasyEnabled).length
  return `${head} · ${ended} finished, ${live} live, ${toStart} to start · ${fantasy} not finished with fantasy data`.slice(0, 200)
}

async function log(ctx: Ctx, endpoint: string, matchId: string | null, credits: number, ok: boolean, note: string | null) {
  await ctx.db.from('api_calls').insert({ endpoint, match_id: matchId, credits, ok, trigger: ctx.trigger, note })
}

async function usage(db: SupabaseClient) {
  const { data } = await db.from('api_usage').select('*').eq('day', utcDay()).maybeSingle()
  return data as { credits: number; calls: number; hits_today: number | null; hits_limit: number | null } | null
}

async function addUsage(db: SupabaseClient, spent: number, info: Record<string, unknown>, cap = 90) {
  const u = await usage(db)
  const after = Math.max((u?.credits ?? 0) + spent, typeof info.hitsToday === 'number' ? info.hitsToday : 0)
  if (after >= cap * 0.8) {
    await db.rpc('admin_alert', { p_kind: 'credits_80', p_title: `Cricket data credits: ${after} of ${cap} used today`,
      p_body: 'Syncing stops at the limit until CricketData resets the count.', p_link: '/admin/data', p_cooldown_minutes: 1200 })
  }
  await db.from('api_usage').upsert({
    day: utcDay(),
    credits: (u?.credits ?? 0) + spent,
    calls: (u?.calls ?? 0) + 1,
    hits_today: typeof info.hitsToday === 'number' ? info.hitsToday : u?.hits_today ?? null,
    hits_limit: typeof info.hitsLimit === 'number' ? info.hitsLimit : u?.hits_limit ?? null,
    updated_at: new Date().toISOString(),
  })
}

const hideKey = (text: string) => text.replace(/apikey=[^&\s)"']+/gi, 'apikey=***')

/**
 * One CricketData request, refused if it would pass the cap. Returns `data` or null.
 * CricketData blocks Supabase's servers, so when CRICKET_PROXY_URL is set the request goes through
 * the Netlify proxy (netlify/functions/cricket.mts). Without it, it calls CricketData directly.
 */
async function api(ctx: Ctx, endpoint: string, params: Record<string, string>, matchId: string | null = null): Promise<unknown> {
  const proxyUrl = Deno.env.get('CRICKET_PROXY_URL')
  const proxyToken = Deno.env.get('CRICKET_PROXY_TOKEN')
  const key = Deno.env.get('CRICKETDATA_API_KEY')
  ctx.last = 'skipped'
  if (!proxyUrl && !key) { await log(ctx, endpoint, matchId, 0, false, 'Set CRICKET_PROXY_URL (recommended) or CRICKETDATA_API_KEY'); return null }
  if (proxyUrl && !proxyToken) { await log(ctx, endpoint, matchId, 0, false, 'CRICKET_PROXY_TOKEN is not set in Supabase secrets'); return null }

  const expected = EXPECTED[endpoint] ?? 1
  const u = await usage(ctx.db)
  const used = Math.max(u?.credits ?? 0, u?.hits_today ?? 0)
  if (used + expected > ctx.s.daily_credit_cap) {
    ctx.capHit = true
    await log(ctx, endpoint, matchId, 0, false, `Skipped: ${used} used, this needs ${expected}, cap is ${ctx.s.daily_credit_cap}`)
    return null
  }

  // deno-lint-ignore no-explicit-any
  let body: any
  try {
    let res: Response
    if (proxyUrl) {
      res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proxy-token': proxyToken! },
        body: JSON.stringify({ endpoint, params }),
        signal: AbortSignal.timeout(25000),
      })
    } else {
      const url = new URL(`${API}/${endpoint}`)
      url.searchParams.set('apikey', key!)
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    }
    const text = await res.text()
    try { body = JSON.parse(text) } catch { body = { status: 'failure', reason: `HTTP ${res.status}: ${text.slice(0, 120)}` } }
  } catch (e) {
    ctx.last = 'error'
    ctx.failures = [...(ctx.failures ?? []), `${endpoint}: couldn’t reach CricketData`]
    await log(ctx, endpoint, matchId, 0, false, hideKey(`${proxyUrl ? 'Proxy' : 'Network'} error: ${String(e)}`).slice(0, 200))
    return null
  }
  const info = (body?.info ?? {}) as Record<string, unknown>
  ctx.lastInfo = info
  const spent = typeof info.hitsUsed === 'number' ? info.hitsUsed : (body?.info ? expected : 0)
  if (spent > 0 || body?.info) await addUsage(ctx.db, spent, info, ctx.s.daily_credit_cap)
  if (body?.status !== 'success') {
    ctx.last = body?.info ? 'failure' : 'error'      // CricketData answered "no" vs. the request never really happened
    ctx.failures = [...(ctx.failures ?? []), `${endpoint}: ${hideKey(String(body?.reason ?? body?.status ?? 'failed')).slice(0, 80)}`]
    await log(ctx, endpoint, matchId, spent, false, hideKey(String(body?.reason ?? body?.status ?? 'Failed')).slice(0, 200))
    return null
  }
  ctx.last = 'ok'
  const rows = Array.isArray(body.data) ? body.data.length : null
  await log(ctx, endpoint, matchId, spent, true, describe(body.data, rows, info))
  return body.data
}

async function saveMatches(db: SupabaseClient, raw: unknown[], seriesName?: string | null): Promise<number> {
  const now = new Date().toISOString()
  const matches: MatchRow[] = []
  const teams = new Map<string, TeamRow>()
  for (const m of raw) {
    const parsed = parseMatch(m as Record<string, unknown>, now, seriesName)
    if (!parsed) continue
    matches.push(parsed.match)
    for (const t of parsed.teams) teams.set(t.key, { ...teams.get(t.key), ...t })
  }
  for (const g of groupByFields([...teams.values()] as unknown as Record<string, unknown>[])) await db.from('teams').upsert(g)
  for (const g of groupByFields(matches as Record<string, unknown>[])) {
    const { error } = await db.from('matches').upsert(g)
    if (error) throw error
  }
  return matches.length
}

/** The match list (live, recent and starting soon): every page, 25 matches a page, 1 credit each (max 4 pages). */
async function syncList(ctx: Ctx) {
  let saved = 0, pages = 0
  for (let offset = 0; pages < 4; offset += 25) {
    const data = await api(ctx, 'currentMatches', { offset: String(offset) })
    if (!Array.isArray(data)) break
    pages++
    saved += await saveMatches(ctx.db, data)
    const total = Number(ctx.lastInfo?.totalRows ?? 0)
    if (data.length < 25 || offset + 25 >= total) break
  }
  await ctx.db.from('app_settings').update({ last_list_sync_at: new Date().toISOString() }).eq('id', 1)
  const { data: opened } = await ctx.db.rpc('notify_squads_out')
  return { saved, pages, squadsOut: opened ?? 0 }
}

/**
 * Upcoming matches: the full schedule of each series being played (series_info, 1 credit per series),
 * at most once a day per series and at most `fixtures_pages` series per run. Removed leagues are skipped.
 */
async function syncSchedules(ctx: Ctx) {
  const max = Math.max(0, ctx.s.fixtures_pages)
  let saved = 0, series = 0
  if (max > 0) {
    const since = new Date(Date.now() - 3 * 864e5).toISOString()
    const { data: rows } = await ctx.db.from('matches').select('series_id, fantasy_ok, ended').not('series_id', 'is', null).gte('starts_at', since)
    const { data: blocked } = await ctx.db.from('blocked_series').select('series_id')
    const { data: checks } = await ctx.db.from('series_schedule_checks').select('series_id, checked_at')
    const skip = new Set((blocked ?? []).map((b: { series_id: string }) => b.series_id))
    const fresh = new Set((checks ?? []).filter((c: { checked_at: string }) => Date.now() - new Date(c.checked_at).getTime() < 20 * 36e5).map((c: { series_id: string }) => c.series_id))
    // Only series still being played that have fantasy data (games can only run on those).
    const live = new Set<string>()
    for (const r of (rows ?? []) as { series_id: string; fantasy_ok: boolean; ended: boolean }[]) if (r.fantasy_ok && !r.ended) live.add(r.series_id)
    const todo = [...live].filter((id) => !skip.has(id) && !fresh.has(id)).slice(0, max)
    for (const id of todo) {
      const data = await api(ctx, 'series_info', { id })
      if (ctx.last === 'skipped' || ctx.last === 'error') break
      // deno-lint-ignore no-explicit-any
      const d = (data ?? {}) as any
      const list: unknown[] = Array.isArray(d.matchList) ? d.matchList : []
      const upcoming = list.filter((m) => {
        // deno-lint-ignore no-explicit-any
        const x = m as any
        const t = new Date(String(x?.dateTimeGMT ?? x?.date ?? '') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(x?.dateTimeGMT ?? '')) ? '' : 'Z')).getTime()
        return !x?.matchEnded && (isNaN(t) || t > Date.now() - 6 * 36e5)
      }).map((m) => ({ ...(m as Record<string, unknown>), series_id: id }))
      saved += await saveMatches(ctx.db, upcoming, d?.info?.name ?? null)
      await ctx.db.from('series_schedule_checks').upsert({ series_id: id, checked_at: new Date().toISOString(), matches: upcoming.length })
      series++
    }
  }
  await ctx.db.from('app_settings').update({ last_fixtures_sync_at: new Date().toISOString() }).eq('id', 1)
  return { saved, series }
}

async function syncInfo(ctx: Ctx, matchId: string) {
  const data = await api(ctx, 'match_info', { id: matchId }, matchId)
  if (!data || typeof data !== 'object') return { updated: false }
  await saveMatches(ctx.db, [data])
  await ctx.db.from('matches').update({ info_fetched_at: new Date().toISOString() }).eq('id', matchId)
  return { updated: true }
}

interface SquadResult { players: number; xi: boolean; called: boolean; message: string }

/** Series squad (1 credit), cached per series for a day. Copies the two teams into this match. Returns players added. */
async function squadFromSeries(ctx: Ctx, matchId: string): Promise<number> {
  const { data: m } = await ctx.db.from('matches').select('series_id').eq('id', matchId).maybeSingle()
  const seriesId = m?.series_id as string | undefined
  if (!seriesId) return 0
  const { data: chk } = await ctx.db.from('series_squad_checks').select('checked_at, players').eq('series_id', seriesId).maybeSingle()
  const fresh = chk && Date.now() - new Date(chk.checked_at).getTime() < 24 * 36e5
  if (!fresh) {
    const now = new Date().toISOString()
    const data = await api(ctx, 'series_squad', { id: seriesId }, matchId)
    if (ctx.last === 'skipped' || ctx.last === 'error') return -1   // try again later, nothing learned
    const rows = parseSquad(seriesId, data, now).map((r) => ({
      series_id: seriesId, team: r.team, player_id: r.player_id, name: r.name, role: r.role, api_role: r.api_role, img: r.img, updated_at: now,
    }))
    if (rows.length) await ctx.db.from('series_players').upsert(rows)
    await ctx.db.from('series_squad_checks').upsert({ series_id: seriesId, checked_at: now, players: rows.length })
    const fields = squadFieldNames(data)
    if (fields) await ctx.db.from('api_calls').insert({ endpoint: 'series_squad', match_id: matchId, credits: 0, ok: true, trigger: ctx.trigger, note: `Player fields: ${fields}`.slice(0, 200) })
  }
  const { data: n } = await ctx.db.rpc('squad_from_series', { p_match: matchId })
  return typeof n === 'number' ? n : 0
}

const releaseClaim = (ctx: Ctx, matchId: string) =>
  ctx.db.from('matches').update({ squad_attempted_at: null }).eq('id', matchId)

const NO_SQUAD = 'CricketData has no squad for this league, so it was removed from Pro11'

/**
 * Fantasy points (match_points, 10 credits). Called at most twice per match: once live (innings break) and once
 * final. The final call is shared: it scores Fantasy XI and, if Predict the XI is still waiting, gives it the XI.
 */
async function fetchPoints(ctx: Ctx, matchId: string, final: boolean): Promise<SquadResult> {
  const col = final ? 'final_points_at' : 'live_points_at'
  const now = new Date().toISOString()
  const { data: claimed } = await ctx.db.from('matches').update({ [col]: now }).eq('id', matchId).is(col, null).select('id')
  if (!claimed?.length) return { players: 0, xi: false, called: false, message: 'Already fetched.' }
  const data = await api(ctx, 'match_points', { id: matchId, ruleset: String(ctx.s.fx_ruleset ?? 0) }, matchId)
  if (ctx.last === 'skipped' || ctx.last === 'error') {
    await ctx.db.from('matches').update({ [col]: null }).eq('id', matchId)
    return { players: 0, xi: false, called: false, message: ctx.capHit ? 'Daily credit limit reached. Will try again when credits reset.' : 'Couldn’t reach CricketData. Will try again.' }
  }
  // deno-lint-ignore no-explicit-any
  const d = (data ?? {}) as any
  // totals per player, and the split (batting / bowling / fielding) summed over every innings
  const pts = new Map<string, { points: number; bat: number; bowl: number; field: number }>()
  const get = (id: string) => pts.get(id) ?? (pts.set(id, { points: 0, bat: 0, bowl: 0, field: 0 }), pts.get(id)!)
  const KIND: Record<string, 'bat' | 'bowl' | 'field'> = { batting: 'bat', bowling: 'bowl', catching: 'field' }
  for (const inn of Array.isArray(d.innings) ? d.innings : []) {
    for (const k of Object.keys(KIND)) for (const p of Array.isArray(inn?.[k]) ? inn[k] : []) {
      if (p?.id) get(String(p.id))[KIND[k]] += Number(p.points) || 0
    }
  }
  for (const t of Array.isArray(d.totals) ? d.totals : []) if (t?.id) get(String(t.id)).points = Number(t.points) || 0
  // if a player has a split but no total, the total is the split
  for (const v of pts.values()) if (!v.points && (v.bat || v.bowl || v.field)) v.points = v.bat + v.bowl + v.field
  if (pts.size) {
    await ctx.db.from('player_points').upsert([...pts.entries()].map(([player_id, v]) => ({ match_id: matchId, player_id, ...v, final, updated_at: now })))
  }
  await ctx.db.rpc('score_fantasy_match', { p_match: matchId, p_final: final && pts.size > 0 })
  let xi = false
  if (final) xi = await xiFromStoredPoints(ctx, matchId)
  return { players: pts.size, xi, called: true, message: `${final ? 'Final' : 'Live'} points for ${pts.size} players${xi ? ', Playing XI set' : ''}.` }
}

/** Optional full batting and bowling card after the match (10 credits, off by default). Fetched once. */
async function fetchScorecard(ctx: Ctx, matchId: string): Promise<string> {
  const { data: claimed } = await ctx.db.from('matches').update({ scorecard_at: new Date().toISOString() }).eq('id', matchId).is('scorecard_at', null).select('id')
  if (!claimed?.length) return 'Already fetched.'
  const data = await api(ctx, 'match_scorecard', { id: matchId }, matchId)
  if (ctx.last === 'skipped' || ctx.last === 'error') { await ctx.db.from('matches').update({ scorecard_at: null }).eq('id', matchId); return 'Will try again.' }
  // deno-lint-ignore no-explicit-any
  const card = (data as any)?.scorecard
  if (Array.isArray(card)) await ctx.db.from('matches').update({ scorecard: card }).eq('id', matchId)
  return Array.isArray(card) ? `Scorecard saved (${card.length} innings).` : 'No scorecard in the answer.'
}

/** Predict the XI fallback (no extra credits): everyone named in the final points list, if that's exactly 11 a side. */
async function xiFromStoredPoints(ctx: Ctx, matchId: string): Promise<boolean> {
  const { data: m } = await ctx.db.from('matches').select('xi_source').eq('id', matchId).maybeSingle()
  await ctx.db.from('matches').update({ xi_points_checked_at: new Date().toISOString() }).eq('id', matchId)
  if (m?.xi_source) return false
  const { data: named } = await ctx.db.from('player_points').select('player_id').eq('match_id', matchId)
  const ids = new Set((named ?? []).map((r: { player_id: string }) => r.player_id))
  const { data: squad } = await ctx.db.from('match_players').select('player_id, team').eq('match_id', matchId)
  const byTeam = new Map<string, string[]>()
  for (const p of squad ?? []) if (ids.has(p.player_id)) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p.player_id])
  const ok = byTeam.size === 2 && [...byTeam.values()].every((v) => v.length === 11)
  await ctx.db.from('api_calls').insert({ endpoint: 'match_points', match_id: matchId, credits: 0, ok, trigger: ctx.trigger,
    note: `Playing XI from points: ${[...byTeam.entries()].map(([t, v]) => `${t} ${v.length}`).join(', ') || 'no players matched'}`.slice(0, 200) })
  if (!ok) return false
  for (const [team, list] of byTeam) {
    await ctx.db.from('match_players').update({ in_xi: false }).eq('match_id', matchId).eq('team', team)
    await ctx.db.from('match_players').update({ in_xi: true }).eq('match_id', matchId).in('player_id', list)
  }
  await ctx.db.from('matches').update({ xi_source: 'api' }).eq('id', matchId)
  await ctx.db.rpc('score_match_xi', { p_match: matchId })
  return true
}

/**
 * One squad call (~10 credits). Every request first CLAIMS the match (squad_attempted_at), so two taps,
 * a join and the scheduled job can never pay twice. Only the admin can force a second try.
 */
async function syncSquad(ctx: Ctx, matchId: string, opts: { xiCheck?: boolean; force?: boolean } = {}): Promise<SquadResult> {
  const now = new Date().toISOString()
  if (opts.xiCheck) {
    const { data: claimed } = await ctx.db.from('matches').update({ xi_checked_at: now }).eq('id', matchId).is('xi_checked_at', null).select('id')
    if (!claimed?.length) return { players: 0, xi: false, called: false, message: 'The Playing XI was already checked for this match.' }
  } else {
    const q = ctx.db.from('matches').update({ squad_attempted_at: now }).eq('id', matchId)
    const { data: claimed } = opts.force ? await q.select('id') : await q.is('squad_attempted_at', null).select('id')
    if (!claimed?.length) return { players: 0, xi: false, called: false, message: 'Squads were already requested for this match. No credits used.' }
  }

  // 1) Series squad: 1 credit for every team in the series, reused for all its matches (checked at most once a day).
  if (!opts.xiCheck) {
    const viaSeries = await squadFromSeries(ctx, matchId)
    if (viaSeries > 0) return { players: viaSeries, xi: false, called: true, message: `${viaSeries} players loaded from the series squad.` }
    if (viaSeries < 0) { await releaseClaim(ctx, matchId); return { players: 0, xi: false, called: false, message: ctx.capHit ? 'Daily credit limit reached. Will try again when credits reset.' : 'Couldn’t reach CricketData. It will try again automatically.' } }
    const { data: mm } = await ctx.db.from('matches').select('has_squad, fantasy_ok').eq('id', matchId).maybeSingle()
    if (!(mm?.has_squad && mm?.fantasy_ok)) {
      await ctx.db.rpc('drop_for_no_data', { p_match: matchId, p_reason: NO_SQUAD })
      return { players: 0, xi: false, called: true, message: `${NO_SQUAD}. Any games were refunded.` }
    }
  }

  // 2) Match squad: a Fantasy API, 10 credits on the free plan.
  const data = await api(ctx, 'match_squad', { id: matchId }, matchId)
  if (ctx.last === 'skipped' || ctx.last === 'error') {
    if (opts.xiCheck) await ctx.db.from('matches').update({ xi_checked_at: null }).eq('id', matchId)
    else await releaseClaim(ctx, matchId)
    return { players: 0, xi: false, called: false, message: ctx.capHit ? 'Daily credit limit reached. Will try again when credits reset.' : 'Couldn’t reach CricketData. It will try again automatically.' }
  }
  const rows = parseSquad(matchId, data, now)
  const fields = squadFieldNames(data)
  if (fields) await ctx.db.from('api_calls').insert({ endpoint: 'match_squad', match_id: matchId, credits: 0, ok: true, trigger: ctx.trigger, note: `Player fields: ${fields}`.slice(0, 200) })
  if (!rows.length) {
    if (opts.xiCheck) return { players: 0, xi: false, called: true, message: 'No Playing XI in the squad data yet.' }
    await ctx.db.rpc('drop_for_no_data', { p_match: matchId, p_reason: NO_SQUAD })
    return { players: 0, xi: false, called: true, message: `${NO_SQUAD}. Any games were refunded.` }
  }
  const { error } = await ctx.db.from('match_players').upsert(rows)
  if (error) throw error
  await ctx.db.from('matches').update({ squad_fetched_at: now }).eq('id', matchId)

  // Playing XI, if the API flags it (exactly 11 a side).
  const xi = parseXi(data)
  if (!xi) return { players: rows.length, xi: false, called: true, message: `${rows.length} players loaded.` }
  for (const [team, ids] of xi) {
    await ctx.db.from('match_players').update({ in_xi: false }).eq('match_id', matchId).eq('team', team)
    await ctx.db.from('match_players').update({ in_xi: true }).eq('match_id', matchId).in('player_id', [...ids])
  }
  await ctx.db.from('matches').update({ xi_source: 'api' }).eq('id', matchId)
  await ctx.db.rpc('score_match_xi', { p_match: matchId })
  return { players: rows.length, xi: true, called: true, message: `${rows.length} players loaded and the Playing XI was set.` }
}

// Expected durations, used to time the live update and the "has it finished?" checks.
const LIVE_AFTER_MIN: Record<string, number> = { T20: 110, ODI: 255, Other: 110 }
const END_AFTER_MIN: Record<string, number> = { T20: 210, ODI: 510, Test: 4 * 24 * 60 + 420, Other: 210 }

interface GameRow { match_id: string; game: 'xi' | 'fantasy'; status: string; lock_at: string; entries?: { count: number }[]
  // deno-lint-ignore no-explicit-any
  matches: any }

/** Everything automatic for matches with games: squads, Playing XI, live and final points, finish checks, refunds. */
async function syncGames(ctx: Ctx) {
  const out: Record<string, unknown> = {}
  const now = Date.now()
  const { data: contests } = await ctx.db.from('contests')
    .select('match_id, game, status, lock_at, entries(count), matches!inner(starts_at, format, status_text, squad_fetched_at, squad_attempted_at, xi_checked_at, xi_points_checked_at, xi_source, live_points_at, final_points_at, end_checked_at, fantasy_ok, has_squad, ended)')
    .in('status', ['open', 'locked'])
  const byMatch = new Map<string, GameRow[]>()
  for (const c of (contests ?? []) as GameRow[]) byMatch.set(c.match_id, [...(byMatch.get(c.match_id) ?? []), c])

  for (const [matchId, games] of byMatch) {
    let m = games[0].matches
    const joined = games.reduce((n, g) => n + (g.entries?.[0]?.count ?? 0), 0)
    const xi = games.find((g) => g.game === 'xi')
    const fx = games.find((g) => g.game === 'fantasy')
    const locked = games.some((g) => g.status === 'locked')
    const start = new Date(m.starts_at).getTime()
    const fmt = (m.format as string) in END_AFTER_MIN ? m.format : 'Other'

    // Abandoned or no result → refund every game on the match
    if (m.ended && /abandon|no result/i.test(m.status_text ?? '')) {
      await ctx.db.rpc('refund_match', { p_match: matchId, p_reason: 'Match abandoned or no result' })
      out[`refund ${matchId}`] = 'abandoned'
      continue
    }
    // Squads: once, when someone has joined (series squad first, 1 credit)
    if (joined > 0 && !m.squad_attempted_at && !m.ended && start - now < 36 * 36e5) {
      out[`squad ${matchId}`] = await syncSquad(ctx, matchId)
      continue
    }
    if (!m.squad_fetched_at || !locked) continue

    // Predict the XI: Playing XI from CricketData 10+ minutes after the toss lock (10 credits, once)
    if (ctx.s.auto_xi_check && xi?.status === 'locked' && m.has_squad && m.fantasy_ok && !m.xi_checked_at && !m.xi_source && !m.ended
        && now > new Date(xi.lock_at).getTime() + 10 * 60e3) {
      out[`xi ${matchId}`] = await syncSquad(ctx, matchId, { xiCheck: true })
    }
    // Live score and "has it finished?": 1 credit per check while a joined match is being played.
    // T20 every `live_score_minutes` (default 30), ODI twice that, Test every 6 hours. With live scores off,
    // it only checks after the expected end, every 30 minutes.
    const base = Math.max(15, ctx.s.live_score_minutes ?? 30)
    const every = (fmt === 'Test' ? 360 : fmt === 'ODI' ? base * 2 : base) * 60e3
    const liveOn = ctx.s.live_scores !== false
    const due = liveOn ? now > start : now > start + END_AFTER_MIN[fmt] * 60e3
    if (!m.ended && due && (!m.end_checked_at || now - new Date(m.end_checked_at).getTime() > (liveOn ? every : 30 * 60e3))) {
      await ctx.db.from('matches').update({ end_checked_at: new Date().toISOString() }).eq('id', matchId)
      await syncInfo(ctx, matchId)
      const { data: fresh } = await ctx.db.from('matches').select('ended, status_text, final_points_at, xi_source').eq('id', matchId).maybeSingle()
      m = { ...m, ...fresh }
      if (m.ended && /abandon|no result/i.test(m.status_text ?? '')) {
        await ctx.db.rpc('refund_match', { p_match: matchId, p_reason: 'Match abandoned or no result' })
        out[`refund ${matchId}`] = 'abandoned'
        continue
      }
    }
    // Fantasy XI: one live points update around the innings break (10 credits, optional), never once it's overdue
    if (ctx.s.fx_live_update && fx?.status === 'locked' && !m.live_points_at && !m.ended && fmt !== 'Test'
        && now > start + LIVE_AFTER_MIN[fmt] * 60e3 && now < start + END_AFTER_MIN[fmt] * 60e3) {
      out[`live ${matchId}`] = await fetchPoints(ctx, matchId, false)
    }
    // Final points, once: needed by Fantasy XI, and by Predict the XI if its XI is still missing (shared, 10 credits)
    if (m.ended && !m.final_points_at && (fx?.status === 'locked' || (xi?.status === 'locked' && !m.xi_source))) {
      out[`final ${matchId}`] = await fetchPoints(ctx, matchId, true)
      if (ctx.s.full_scorecard) out[`scorecard ${matchId}`] = await fetchScorecard(ctx, matchId)
    }
  }
  return out
}

const hoursSince = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : Infinity)

async function tick(ctx: Ctx) {
  if (ctx.s.sync_paused) return { skipped: 'Syncing is paused' }
  const out: Record<string, unknown> = {}
  // 5 minutes of slack so an hourly job lands on the 3-hour mark reliably.
  if (hoursSince(ctx.s.last_list_sync_at) >= ctx.s.list_refresh_hours - 0.09) out.list = await syncList(ctx)
  if (ctx.s.fixtures_pages > 0 && hoursSince(ctx.s.last_fixtures_sync_at) >= ctx.s.fixtures_refresh_hours - 0.09) {
    out.schedules = await syncSchedules(ctx)
  }
  const games = await syncGames(ctx)
  if (Object.keys(games).length) out.games = games
  if (ctx.failures?.length) {
    await ctx.db.rpc('admin_alert', { p_kind: 'sync_failed', p_title: 'Cricket data sync had a problem',
      p_body: ctx.failures.slice(0, 3).join(' · '), p_link: '/admin/data', p_cooldown_minutes: 360 })
  }
  return Object.keys(out).length ? out : { skipped: 'Nothing due' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  try {
    const db = adminClient()
    const caller = await authorize(req, db)
    if (!caller) return json({ error: 'Not allowed.' }, 401)

    const { data: s, error } = await db.from('app_settings').select('*').eq('id', 1).single()
    if (error || !s) return json({ error: 'Settings missing. Run the step 2 migration.' }, 500)
    const ctx: Ctx = { db, s: s as DataSettings, trigger: caller.trigger }

    const body = (await req.json().catch(() => ({}))) as { mode?: string; matchId?: string }
    const mode = body.mode ?? 'tick'
    const matchId = body.matchId ? String(body.matchId) : null

    // Cricbuzz (unofficial, free): the default source
    if ((s as { data_source?: string }).data_source === 'cricbuzz') {
      if (mode === 'tick' && !caller.userId) return json({ ok: true, result: await tickCricbuzz(ctx) })
      if (mode === 'squad-for-entry' && matchId?.startsWith('cb-') && caller.userId) {
        const { data: mine } = await db.from('entries').select('id, contests!inner(match_id)').eq('user_id', caller.userId).eq('contests.match_id', matchId).limit(1)
        if (!mine?.length) return json({ error: 'Join the game first.' }, 403)
        return json({ ok: true, result: await cbManual(ctx, 'squad-for-entry', matchId) })
      }
      if (caller.isAdmin && (matchId?.startsWith('cb-') || mode === 'list' || mode === 'fixtures')) {
        const r = await cbManual(ctx, mode, matchId)
        if (r) return json({ ok: true, result: r })
      }
    }
    if (mode === 'tick' && !caller.userId) return json({ ok: true, result: await tick(ctx) })

    // A member who joined a game can trigger the one-time squad fetch for that match.
    if (mode === 'squad-for-entry' && matchId && caller.userId) {
      const { data: m } = await db.from('matches').select('squad_fetched_at, squad_attempted_at, fantasy_ok, has_squad, series_id').eq('id', matchId).maybeSingle()
      if (!m) return json({ error: 'Match not found.' }, 404)
      const none = { players: 0, xi: false, called: false }
      if (m.squad_fetched_at) return json({ ok: true, result: { ...none, message: 'Squads are already loaded.' } })
      if (m.squad_attempted_at) return json({ ok: true, result: { ...none, message: 'Squads are loading. Check again in a minute.' } })
      if (!m.series_id && !(m.fantasy_ok && m.has_squad)) return json({ ok: true, result: { ...none, message: 'CricketData has no squad for this match.' } })
      const { data: mine } = await db.from('entries').select('id, contests!inner(match_id)').eq('user_id', caller.userId).eq('contests.match_id', matchId).limit(1)
      if (!mine?.length) return json({ error: 'Join the game first.' }, 403)
      return json({ ok: true, result: await syncSquad(ctx, matchId) })
    }

    if (!caller.isAdmin) return json({ error: 'Not allowed.' }, 401)
    if (mode === 'list') return json({ ok: true, result: await syncList(ctx) })
    if (mode === 'fixtures') return json({ ok: true, result: await syncSchedules(ctx) })
    if (mode === 'info' && matchId) return json({ ok: true, result: await syncInfo(ctx, matchId) })
    if (mode === 'squad' && matchId) return json({ ok: true, result: await syncSquad(ctx, matchId, { force: true }) })
    return json({ error: 'Unknown request.' }, 400)
  } catch (e) {
    console.error('sync-cricket', e)
    return json({ error: 'Sync failed. Check the function logs.' }, 500)
  }
})
