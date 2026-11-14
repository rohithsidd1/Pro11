// Pro11 cricket data sync. Called by:
//   • the hourly database job (header x-sync-token) with { mode: "tick" }
//   • the admin app (signed-in admin) with { mode: "list" | "fixtures" | "squad" | "info", matchId? }
//   • a member who just joined a game with { mode: "squad-for-entry", matchId } (only fetches once per match)
// Every call to CricketData is checked against the daily credit cap and logged with its real cost.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, cors, json } from '../_shared/util.ts'
import { parseMatch, parseSquad, parseXi, squadFieldNames, type MatchRow, type TeamRow } from '../_shared/cricket.ts'

const API = 'https://api.cricapi.com/v1'
// What we expect each call to cost. The API reports the real figure (info.hitsUsed) and we log that.
const EXPECTED: Record<string, number> = { currentMatches: 1, matches: 1, match_info: 1, match_squad: 10 }

type Trigger = 'auto' | 'admin'
type DataSettings = {
  daily_credit_cap: number; list_refresh_hours: number; fixtures_refresh_hours: number; fixtures_pages: number
  sync_paused: boolean; last_list_sync_at: string | null; last_fixtures_sync_at: string | null
}
interface Ctx { db: SupabaseClient; s: DataSettings; trigger: Trigger }

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

async function log(ctx: Ctx, endpoint: string, matchId: string | null, credits: number, ok: boolean, note: string | null) {
  await ctx.db.from('api_calls').insert({ endpoint, match_id: matchId, credits, ok, trigger: ctx.trigger, note })
}

async function usage(db: SupabaseClient) {
  const { data } = await db.from('api_usage').select('*').eq('day', utcDay()).maybeSingle()
  return data as { credits: number; calls: number; hits_today: number | null; hits_limit: number | null } | null
}

async function addUsage(db: SupabaseClient, spent: number, info: Record<string, unknown>) {
  const u = await usage(db)
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
  if (!proxyUrl && !key) { await log(ctx, endpoint, matchId, 0, false, 'Set CRICKET_PROXY_URL (recommended) or CRICKETDATA_API_KEY'); return null }
  if (proxyUrl && !proxyToken) { await log(ctx, endpoint, matchId, 0, false, 'CRICKET_PROXY_TOKEN is not set in Supabase secrets'); return null }

  const expected = EXPECTED[endpoint] ?? 1
  const u = await usage(ctx.db)
  const used = Math.max(u?.credits ?? 0, u?.hits_today ?? 0)
  if (used + expected > ctx.s.daily_credit_cap) {
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
    await log(ctx, endpoint, matchId, 0, false, hideKey(`${proxyUrl ? 'Proxy' : 'Network'} error: ${String(e)}`).slice(0, 200))
    return null
  }
  const info = (body?.info ?? {}) as Record<string, unknown>
  const spent = typeof info.hitsUsed === 'number' ? info.hitsUsed : (body?.info ? expected : 0)
  if (spent > 0 || body?.info) await addUsage(ctx.db, spent, info)
  if (body?.status !== 'success') {
    await log(ctx, endpoint, matchId, spent, false, hideKey(String(body?.reason ?? body?.status ?? 'Failed')).slice(0, 200))
    return null
  }
  const rows = Array.isArray(body.data) ? body.data.length : null
  await log(ctx, endpoint, matchId, spent, true, rows === null ? null : `${rows} rows${info.totalRows ? ` of ${info.totalRows}` : ''}`)
  return body.data
}

async function saveMatches(db: SupabaseClient, raw: unknown[]): Promise<number> {
  const now = new Date().toISOString()
  const matches: MatchRow[] = []
  const teams = new Map<string, TeamRow>()
  for (const m of raw) {
    const parsed = parseMatch(m as Record<string, unknown>, now)
    if (!parsed) continue
    matches.push(parsed.match)
    for (const t of parsed.teams) teams.set(t.key, { ...teams.get(t.key), ...t })
  }
  if (teams.size) await db.from('teams').upsert([...teams.values()])
  if (matches.length) {
    const { error } = await db.from('matches').upsert(matches)
    if (error) throw error
  }
  return matches.length
}

async function syncList(ctx: Ctx) {
  let saved = 0
  for (let offset = 0, page = 0; page < 2; page++, offset += 25) {
    const data = await api(ctx, 'currentMatches', { offset: String(offset) })
    if (!Array.isArray(data)) break
    saved += await saveMatches(ctx.db, data)
    if (data.length < 25) break
  }
  await ctx.db.from('app_settings').update({ last_list_sync_at: new Date().toISOString() }).eq('id', 1)
  return { saved }
}

async function syncFixtures(ctx: Ctx) {
  let saved = 0
  for (let page = 0; page < Math.max(1, ctx.s.fixtures_pages); page++) {
    const data = await api(ctx, 'matches', { offset: String(page * 25) })
    if (!Array.isArray(data)) break
    saved += await saveMatches(ctx.db, data)
    if (data.length < 25) break
  }
  await ctx.db.from('app_settings').update({ last_fixtures_sync_at: new Date().toISOString() }).eq('id', 1)
  return { saved }
}

async function syncInfo(ctx: Ctx, matchId: string) {
  const data = await api(ctx, 'match_info', { id: matchId }, matchId)
  if (!data || typeof data !== 'object') return { updated: false }
  await saveMatches(ctx.db, [data])
  await ctx.db.from('matches').update({ info_fetched_at: new Date().toISOString() }).eq('id', matchId)
  return { updated: true }
}

async function syncSquad(ctx: Ctx, matchId: string, opts: { xiCheck?: boolean } = {}) {
  const data = await api(ctx, 'match_squad', { id: matchId }, matchId)
  const now = new Date().toISOString()
  const rows = parseSquad(matchId, data, now)
  const fields = squadFieldNames(data)
  if (fields) await ctx.db.from('api_calls').insert({ endpoint: 'match_squad', match_id: matchId, credits: 0, ok: true, trigger: ctx.trigger, note: `Player fields: ${fields}`.slice(0, 200) })
  if (opts.xiCheck) await ctx.db.from('matches').update({ xi_checked_at: now }).eq('id', matchId)
  if (!rows.length) return { players: 0, xi: false }
  const { error } = await ctx.db.from('match_players').upsert(rows)
  if (error) throw error
  await ctx.db.from('matches').update({ squad_fetched_at: now }).eq('id', matchId)

  // Playing XI, if the API flags it (exactly 11 a side). Never overrides an XI the admin set.
  const xi = parseXi(data)
  if (!xi) return { players: rows.length, xi: false }
  const { data: m } = await ctx.db.from('matches').select('xi_source').eq('id', matchId).maybeSingle()
  if (m?.xi_source === 'admin') return { players: rows.length, xi: false }
  for (const [team, ids] of xi) {
    await ctx.db.from('match_players').update({ in_xi: false }).eq('match_id', matchId).eq('team', team)
    await ctx.db.from('match_players').update({ in_xi: true }).eq('match_id', matchId).in('player_id', [...ids])
  }
  await ctx.db.from('matches').update({ xi_source: 'api' }).eq('id', matchId)
  await ctx.db.rpc('score_match_xi', { p_match: matchId })
  return { players: rows.length, xi: true }
}

/** Squads for games people joined, and one Playing XI check after the toss. */
async function syncGames(ctx: Ctx) {
  const out: Record<string, unknown> = {}
  const now = Date.now()
  const { data: contests } = await ctx.db.from('contests')
    .select('match_id, status, lock_at, entries(count), matches!inner(starts_at, squad_fetched_at, xi_checked_at, xi_source, fantasy_ok, ended)')
    .in('status', ['open', 'locked'])
  // deno-lint-ignore no-explicit-any
  const rows = (contests ?? []) as any[]
  const seen = new Set<string>()
  for (const c of rows) {
    if (seen.has(c.match_id)) continue
    seen.add(c.match_id)
    const m = c.matches
    const joined = c.entries?.[0]?.count ?? 0
    const startsIn = new Date(m.starts_at).getTime() - now
    if (!m.fantasy_ok || m.ended) continue
    // squads: someone joined, within 36 h of the start, never fetched
    if (joined > 0 && !m.squad_fetched_at && startsIn < 36 * 36e5) {
      out[`squad ${c.match_id}`] = await syncSquad(ctx, c.match_id)
      continue
    }
    // Playing XI: once, 10+ minutes after the lock, if the XI isn't set yet
    if (c.status === 'locked' && !m.xi_checked_at && !m.xi_source && now > new Date(c.lock_at).getTime() + 10 * 60e3) {
      out[`xi ${c.match_id}`] = await syncSquad(ctx, c.match_id, { xiCheck: true })
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
    out.fixtures = await syncFixtures(ctx)
  }
  const games = await syncGames(ctx)
  if (Object.keys(games).length) out.games = games
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

    if (mode === 'tick' && !caller.userId) return json({ ok: true, result: await tick(ctx) })

    // A member who joined a game can trigger the one-time squad fetch for that match.
    if (mode === 'squad-for-entry' && matchId && caller.userId) {
      const { data: m } = await db.from('matches').select('squad_fetched_at, fantasy_ok').eq('id', matchId).maybeSingle()
      if (!m) return json({ error: 'Match not found.' }, 404)
      if (m.squad_fetched_at) return json({ ok: true, result: { players: 'already loaded' } })
      const { data: mine } = await db.from('entries').select('id, contests!inner(match_id)').eq('user_id', caller.userId).eq('contests.match_id', matchId).limit(1)
      if (!mine?.length) return json({ error: 'Join the game first.' }, 403)
      if (!m.fantasy_ok) return json({ error: 'The data service has no squads for this match. Ask the admin to add them.' }, 422)
      return json({ ok: true, result: await syncSquad(ctx, matchId) })
    }

    if (!caller.isAdmin) return json({ error: 'Not allowed.' }, 401)
    if (mode === 'list') return json({ ok: true, result: await syncList(ctx) })
    if (mode === 'fixtures') return json({ ok: true, result: await syncFixtures(ctx) })
    if (mode === 'info' && matchId) return json({ ok: true, result: await syncInfo(ctx, matchId) })
    if (mode === 'squad' && matchId) return json({ ok: true, result: await syncSquad(ctx, matchId) })
    return json({ error: 'Unknown request.' }, 400)
  } catch (e) {
    console.error('sync-cricket', e)
    return json({ error: 'Sync failed. Check the function logs.' }, 500)
  }
})
