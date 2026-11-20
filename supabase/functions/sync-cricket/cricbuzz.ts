// Pro11 · Cricbuzz data source (unofficial, free). Called every 5 minutes; each step only runs when due.
// The Netlify function "cricbuzz" fetches and reads the pages; this file decides what to fetch and stores it.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { categorize, groupByFields } from '../_shared/cricket.ts'

// deno-lint-ignore no-explicit-any
type Any = any
export interface CbCtx { db: SupabaseClient; s: Any }

const ENDED_BAD = /abandon|no result|cancel/i
const isoNow = () => new Date().toISOString()
const minutesSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity)
const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function endpoint() {
  const explicit = Deno.env.get('CRICBUZZ_URL')
  if (explicit) return explicit
  const proxy = Deno.env.get('CRICKET_PROXY_URL') ?? ''
  return proxy.replace(/\/cricket\/?$/, '/cricbuzz')
}

/** One call to the Netlify reader. Records health per action for the admin page. */
async function cb(ctx: CbCtx, action: string, payload: Record<string, unknown> = {}): Promise<Any | null> {
  const t0 = Date.now()
  let body: Any = null, ok = false, error: string | undefined
  try {
    const r = await fetch(endpoint(), {
      method: 'POST', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-proxy-token': Deno.env.get('CRICKET_PROXY_TOKEN') ?? '' },
      body: JSON.stringify({ action, ...payload }),
    })
    body = await r.json().catch(() => null)
    ok = r.ok && body && !body.error
    if (!ok) error = String(body?.error ?? `HTTP ${r.status}`).slice(0, 160)
  } catch (e) {
    error = String(e).slice(0, 160)
  }
  const found = action === 'list' || action === 'schedule' ? body?.matches?.length ?? 0
    : action === 'roles' ? Object.keys(body?.roles ?? {}).length
    : (body?.scorecard?.teams?.length ?? 0) + (body?.scorecard?.innings?.length ?? 0)
  const health = { ...(ctx.s.cb_health ?? {}) }
  const prev = health[action] ?? {}
  health[action] = { at: isoNow(), ok: ok && (found > 0 || action === 'roles'), found, ms: Date.now() - t0, error,
    fails: ok && found > 0 ? 0 : (prev.fails ?? 0) + 1, sources: body?.sources ?? null }
  ctx.s.cb_health = health
  await ctx.db.from('app_settings').update({ cb_health: health }).eq('id', 1)
  if ((action === 'list') && health[action].fails >= 2) {
    await ctx.db.rpc('admin_alert', { p_kind: 'cb_broken', p_title: 'Cricbuzz reader may be broken',
      p_body: `The match list came back empty ${health[action].fails} times in a row. Open Admin → Cricket data → Health and send the report to Claude.`,
      p_link: '/admin/data', p_cooldown_minutes: 360 })
  }
  return ok ? body : null
}

// ---------------- matches ----------------
function rowFor(m: Any) {
  const a = m.teamA ?? m.teamAShort, b = m.teamB ?? m.teamBShort
  if (!m.id || !a || !b) return null
  const name = [`${a} vs ${b}`, m.desc, m.series].filter(Boolean).join(', ')
  const row: Record<string, unknown> = {
    id: `cb-${m.id}`, name, team_a: a, team_b: b, format: m.format ?? 'Other', category: categorize(name, a, b),
    is_women: /\bwomen\b|\bw\b/i.test(`${a} ${b} ${m.series ?? ''}`), fantasy_ok: true, last_synced_at: isoNow(),
  }
  if (m.teamAShort) row.team_a_short = m.teamAShort
  if (m.teamBShort) row.team_b_short = m.teamBShort
  if (m.desc) row.label = m.desc
  if (m.series) { row.series_name = m.series; row.series_id = m.seriesId ? `cbs-${m.seriesId}` : `cbs-${slugify(m.series)}` }
  if (m.slug) row.cb_slug = m.slug
  if (m.statusText) row.status_text = m.statusText
  if (m.venue) row.venue = m.venue
  if (m.state) { row.started = m.state !== 'upcoming'; row.ended = m.state === 'ended' }
  if (m.startsAt) row.starts_at = m.startsAt
  return row
}

/** Saves matches. Never replaces a start time that was confirmed from the match's own page. */
async function saveMatches(ctx: CbCtx, list: Any[]): Promise<{ saved: number; needTime: Any[] }> {
  const rows = list.map(rowFor).filter(Boolean) as Record<string, unknown>[]
  if (!rows.length) return { saved: 0, needTime: [] }
  const ids = rows.map((r) => r.id as string)
  const { data: existing } = await ctx.db.from('matches').select('id, time_verified, starts_at').in('id', ids)
  const known = new Map((existing ?? []).map((e: Any) => [e.id, e]))
  const ready: Record<string, unknown>[] = [], needTime: Any[] = []
  for (const r of rows) {
    const e: Any = known.get(r.id as string)
    if (e?.time_verified || (e && !r.starts_at)) r.starts_at = e.starts_at   // keep the confirmed time (the row must still carry one)
    if (!e && !r.starts_at) { needTime.push(list.find((m) => `cb-${m.id}` === r.id)); continue }   // new match with no time yet
    ready.push(r)
  }
  for (const g of groupByFields(ready)) {
    const { error } = await ctx.db.from('matches').upsert(g)
    if (error) throw error
  }
  return { saved: ready.length, needTime }
}

async function cbList(ctx: CbCtx) {
  const body = await cb(ctx, 'list')
  await ctx.db.from('app_settings').update({ last_cb_list_at: isoNow(), last_list_sync_at: isoNow() }).eq('id', 1)
  if (!body) return { saved: 0, error: 'Cricbuzz list failed' }
  const r = await saveMatches(ctx, body.matches)
  // new matches without a start time: read their own page now (a few per run)
  let timed = 0
  for (const m of r.needTime.filter((x) => x && x.state !== 'ended').slice(0, 6)) {
    const info = await cb(ctx, 'info', { id: m.id, slug: m.slug })
    if (info?.scorecard?.startsAt) { await saveMatches(ctx, [{ ...m, startsAt: info.scorecard.startsAt }]); await applyInfo(ctx, `cb-${m.id}`, info.scorecard); timed++ }
  }
  const { data: opened } = await ctx.db.rpc('notify_squads_out')
  return { saved: r.saved + timed, found: body.matches.length, squadsOut: opened ?? 0 }
}

async function cbSchedule(ctx: CbCtx) {
  const body = await cb(ctx, 'schedule')
  await ctx.db.from('app_settings').update({ last_cb_schedule_at: isoNow(), last_fixtures_sync_at: isoNow() }).eq('id', 1)
  if (!body) return { saved: 0, error: 'Cricbuzz schedule failed' }
  const upcoming = body.matches.filter((m: Any) => m.state !== 'ended')
  const r = await saveMatches(ctx, upcoming)
  return { saved: r.saved, found: upcoming.length, withoutTime: r.needTime.length }
}

// ---------------- one match: time, toss, squads, Playing XI ----------------
function teamOf(scTeam: string, m: Any): string {
  const n = norm(scTeam)
  for (const t of [m.team_a, m.team_b]) if (norm(t) === n) return t
  for (const t of [m.team_a, m.team_b]) if (n && (norm(t).includes(n) || n.includes(norm(t)))) return t
  for (const [t, sh] of [[m.team_a, m.team_a_short], [m.team_b, m.team_b_short]]) if (sh && n.startsWith(norm(sh))) return t
  return scTeam
}

/** Applies a scorecard/info answer to a match: start time, toss, status, squads with roles, Playing XI. */
async function applyInfo(ctx: CbCtx, matchId: string, sc: Any): Promise<{ players: number; xi: boolean }> {
  const { data: m } = await ctx.db.from('matches').select('*').eq('id', matchId).maybeSingle()
  if (!m) return { players: 0, xi: false }
  const up: Record<string, unknown> = { cb_info_at: isoNow() }
  if (sc.startsAt) { up.starts_at = sc.startsAt; up.time_verified = true }
  if (sc.venue) up.venue = sc.venue
  if (sc.toss?.text) up.toss_text = sc.toss.text
  if (sc.status) up.status_text = sc.status
  if (sc.state) { up.started = sc.state !== 'upcoming'; up.ended = sc.state === 'ended' }
  if (sc.series && !m.series_name) up.series_name = sc.series
  if (Array.isArray(sc.innings) && sc.innings.length) {
    up.score = sc.innings.map((i: Any, k: number) => ({ inning: `${teamOf(i.team, m)} Inning ${k < 2 ? 1 : 2}`, r: i.r ?? 0, w: i.w ?? 0, o: i.o ?? 0 }))
  }
  await ctx.db.from('matches').update(up).eq('id', matchId)

  // squads (with roles from the cache; unknown roles are learned by cbRoles)
  const teams: Any[] = Array.isArray(sc.teams) ? sc.teams : []
  const all = teams.flatMap((t) => t.players.map((p: Any) => ({ ...p, team: teamOf(t.name, m) })))
  if (!all.length) return { players: 0, xi: false }
  const { data: cache } = await ctx.db.from('cb_players').select('profile_id, role').in('profile_id', all.map((p) => p.id))
  const roles = new Map((cache ?? []).filter((c: Any) => c.role).map((c: Any) => [c.profile_id, c.role]))
  const { data: had } = await ctx.db.from('match_players').select('player_id, role, api_role').eq('match_id', matchId)
  const prev = new Map((had ?? []).map((h: Any) => [h.player_id, h]))
  const rows = all.map((p) => {
    const before: Any = prev.get(p.id)
    const known = p.role ?? roles.get(p.id)
    return {
      match_id: matchId, player_id: p.id, name: p.name, team: p.team,
      role: known ?? before?.role ?? (p.keeper ? 'WK' : 'BAT'),
      api_role: known ? 'known' : before?.api_role === 'guessed' ? 'guessed' : 'unknown',   // never loop a guessed role back
    }
  })
  const { error: upErr } = await ctx.db.from('match_players').upsert(rows, { onConflict: 'match_id,player_id' })
  if (upErr) throw upErr
  await ctx.db.from('cb_players').upsert(all.map((p) => ({ profile_id: p.id, name: p.name, slug: p.slug ?? null, role: p.role ?? roles.get(p.id) ?? null, checked_at: isoNow() })), { onConflict: 'profile_id' })

  const perTeam = new Map<string, number>()
  for (const p of all) perTeam.set(p.team, (perTeam.get(p.team) ?? 0) + 1)
  const squadsReady = perTeam.size === 2 && [...perTeam.values()].every((n) => n >= 11)
  if (squadsReady && !m.has_squad) await ctx.db.from('matches').update({ has_squad: true, squad_fetched_at: m.squad_fetched_at ?? isoNow() }).eq('id', matchId)

  // Playing XI: exactly 11 "Playing" a side
  const xi = new Map<string, string[]>()
  for (const p of all.filter((x) => x.group === 'playing')) xi.set(p.team, [...(xi.get(p.team) ?? []), p.id])
  const xiOk = xi.size === 2 && [...xi.values()].every((v) => v.length === 11)
  if (xiOk && m.xi_source !== 'api') {
    for (const [team, ids] of xi) {
      await ctx.db.from('match_players').update({ in_xi: false }).eq('match_id', matchId).eq('team', team)
      await ctx.db.from('match_players').update({ in_xi: true }).eq('match_id', matchId).in('player_id', ids)
    }
    await ctx.db.from('matches').update({ xi_source: 'api', xi_checked_at: isoNow() }).eq('id', matchId)
    await ctx.db.rpc('score_match_xi', { p_match: matchId })
  }
  return { players: all.length, xi: xiOk }
}

/**
 * Upcoming matches members can see (or that have games): squads with roles, toss, Playing XI.
 * Within 2 hours of the start: every 5 minutes (to catch the toss and Playing XI). Squads not out yet:
 * every 15 minutes (48 h ahead) or 2 hours (later). Squads already loaded and more than 2 hours away: every 6 hours.
 */
async function cbInfoPass(ctx: CbCtx, budget: number, force = false) {
  const now = Date.now()
  const { data: rows } = await ctx.db.from('matches')
    .select('id, cb_slug, starts_at, cb_info_at, has_squad, category, is_women, visibility, series_id, xi_source')
    .like('id', 'cb-%').eq('ended', false)
    .gte('starts_at', new Date(now - 6 * 36e5).toISOString()).lte('starts_at', new Date(now + 10 * 864e5).toISOString())
    .order('starts_at').limit(300)
  const { data: blocked } = await ctx.db.from('blocked_series').select('series_id')
  const bl = new Set((blocked ?? []).map((b: Any) => b.series_id))
  const { data: games } = await ctx.db.from('contests').select('match_id').in('status', ['open', 'locked', 'scored'])
  const withGames = new Set((games ?? []).map((g: Any) => g.match_id))
  const s = ctx.s
  const visible = (m: Any) => withGames.has(m.id) || (m.visibility !== 'hidden' && !bl.has(m.series_id) && (!m.is_women || s.show_women_intl) && (m.visibility === 'shown'
    || (m.category === 'international' && s.show_men_intl) || (m.category === 'league' && s.show_leagues)
    || (m.category !== 'international' && m.category !== 'league' && s.show_domestic)))
  const due = (rows ?? []).filter((m: Any) => {
    if (!visible(m)) return false
    if (force) return true
    const hoursAway = (new Date(m.starts_at).getTime() - now) / 36e5
    const every = hoursAway < 2 && !m.xi_source ? 5 : !m.has_squad ? (hoursAway < 48 ? 15 : 120) : 360
    return minutesSince(m.cb_info_at) >= every - 0.5
  }).slice(0, budget)
  const out: Record<string, unknown> = {}
  for (let i = 0; i < due.length; i += 4) {
    await Promise.all(due.slice(i, i + 4).map(async (m: Any) => {
      const body = await cb(ctx, 'info', { id: m.id.slice(3) })
      if (!body) { await ctx.db.from('matches').update({ cb_info_at: isoNow() }).eq('id', m.id); return }
      out[m.id] = await applyInfo(ctx, m.id, body.scorecard)
      if (ENDED_BAD.test(body.scorecard?.status ?? '') && body.scorecard?.state === 'ended') await ctx.db.rpc('refund_match', { p_match: m.id, p_reason: 'Match abandoned or no result' })
    }))
  }
  return out
}

/** Learn unknown player roles (squads page first, then profiles), then fix them in every match. */
async function cbRoles(ctx: CbCtx, calls: number) {
  const { data: unknown } = await ctx.db.from('match_players').select('match_id, player_id').eq('api_role', 'unknown').like('match_id', 'cb-%').limit(400)
  if (!unknown?.length) return { learned: 0 }
  const byMatch = new Map<string, string[]>()
  for (const u of unknown as Any[]) byMatch.set(u.match_id, [...(byMatch.get(u.match_id) ?? []), u.player_id])
  let learned = 0
  for (const [matchId, ids] of [...byMatch.entries()].slice(0, calls)) {
    const { data: m } = await ctx.db.from('matches').select('cb_slug').eq('id', matchId).maybeSingle()
    const { data: slugs } = await ctx.db.from('cb_players').select('profile_id, slug').in('profile_id', ids)
    const players = ids.map((id) => ({ id, slug: (slugs ?? []).find((x: Any) => x.profile_id === id)?.slug ?? undefined }))
    const body = await cb(ctx, 'roles', { id: matchId.slice(3), slug: m?.cb_slug ?? undefined, players })
    const roles: Record<string, string> = body?.roles ?? {}
    for (const [pid, role] of Object.entries(roles)) {
      await ctx.db.from('cb_players').update({ role, checked_at: isoNow() }).eq('profile_id', pid)
      await ctx.db.from('match_players').update({ role, api_role: 'known' }).eq('player_id', pid).like('match_id', 'cb-%')
      learned++
    }
    // a profile Cricbuzz can't describe: fall back to a sensible role so games aren't blocked forever
    const stillUnknown = players.filter((p) => !roles[p.id])
    if (body && stillUnknown.length && Object.keys(roles).length === 0) {
      for (const p of stillUnknown) await ctx.db.from('match_players').update({ api_role: 'guessed' }).eq('player_id', p.id).eq('match_id', matchId)
    }
    await applyRolesReady(ctx, matchId)
  }
  return { learned }
}

async function applyRolesReady(ctx: CbCtx, matchId: string) {
  const { data: ps } = await ctx.db.from('match_players').select('team, api_role').eq('match_id', matchId)
  const teams = new Map<string, number>()
  for (const p of (ps ?? []) as Any[]) teams.set(p.team, (teams.get(p.team) ?? 0) + 1)
  const ready = teams.size === 2 && [...teams.values()].every((n) => n >= 11) && !(ps ?? []).some((p: Any) => p.api_role === 'unknown')
  if (ready) await ctx.db.from('matches').update({ has_squad: true, squad_fetched_at: isoNow() }).eq('id', matchId).eq('has_squad', false)
}

// ---------------- live games: score, Playing XI, points ----------------
async function cbLivePass(ctx: CbCtx, budget: number) {
  const { data: games } = await ctx.db.from('contests').select('match_id, game, status, matches!inner(id, cb_slug, starts_at, format, ended, cb_live_at)')
    .in('status', ['open', 'locked']).like('match_id', 'cb-%')
  const byMatch = new Map<string, Any>()
  for (const g of (games ?? []) as Any[]) byMatch.set(g.match_id, { m: g.matches, games: [...(byMatch.get(g.match_id)?.games ?? []), g] })
  const now = Date.now()
  const out: Record<string, unknown> = {}
  const due = [...byMatch.values()].filter(({ m }) => !m.ended && now >= new Date(m.starts_at).getTime() - 45 * 60e3
    && minutesSince(m.cb_live_at) >= Math.max(1, ctx.s.cb_live_minutes ?? 1) - 0.25).slice(0, budget)
  for (const { m, games: gs } of due) {
    await ctx.db.from('matches').update({ cb_live_at: isoNow() }).eq('id', m.id)
    const { data: known } = await ctx.db.from('match_players').select('player_id, role').eq('match_id', m.id)
    const roles = Object.fromEntries((known ?? []).map((p: Any) => [p.player_id, p.role]))
    const body = await cb(ctx, 'scorecard', { id: m.id.slice(3), format: m.format, rules: ctx.s.fx_rules ?? {}, roles })
    if (!body) continue
    const sc = body.scorecard
    const info = await applyInfo(ctx, m.id, sc)
    if (ENDED_BAD.test(sc.status ?? '') && sc.state === 'ended') {
      await ctx.db.rpc('refund_match', { p_match: m.id, p_reason: 'Match abandoned or no result' })
      out[m.id] = 'refunded'; continue
    }
    const fantasyLocked = gs.some((g: Any) => g.game === 'fantasy' && g.status === 'locked')
    const ended = sc.state === 'ended'
    const pts = Object.entries(body.points ?? {}) as [string, Any][]
    if (pts.length && (fantasyLocked || ended)) {
      await ctx.db.from('player_points').upsert(pts.map(([pid, p]) => ({ match_id: m.id, player_id: pid, points: p.points, bat: p.bat, bowl: p.bowl, field: p.field, final: ended, updated_at: isoNow() })))
      await ctx.db.rpc('score_fantasy_match', { p_match: m.id, p_final: ended })
      await ctx.db.from('matches').update(ended ? { live_points_at: isoNow(), final_points_at: isoNow(), xi_points_checked_at: isoNow() } : { live_points_at: isoNow() }).eq('id', m.id)
    } else if (ended) {
      await ctx.db.from('matches').update({ final_points_at: isoNow(), xi_points_checked_at: isoNow() }).eq('id', m.id)
    }
    out[m.id] = { state: sc.state, status: sc.status, xi: info.xi, points: pts.length }
  }
  return out
}

// ---------------- the 5-minute run ----------------
export async function tickCricbuzz(ctx: CbCtx) {
  if (ctx.s.sync_paused) return { skipped: 'Syncing is paused' }
  const out: Record<string, unknown> = {}
  if (minutesSince(ctx.s.last_cb_list_at) >= (ctx.s.cb_list_minutes ?? 5) - 0.5) out.list = await cbList(ctx)
  if (minutesSince(ctx.s.last_cb_schedule_at) >= (ctx.s.cb_schedule_hours ?? 12) * 60 - 1) out.schedule = await cbSchedule(ctx)
  const live = await cbLivePass(ctx, 4)
  if (Object.keys(live).length) out.live = live
  const info = await cbInfoPass(ctx, 8)
  if (Object.keys(info).length) out.info = info
  const roles = await cbRoles(ctx, 1)
  if (roles.learned) out.roles = roles
  const { data: opened } = await ctx.db.rpc('notify_squads_out')   // games that just opened, from any step above
  if (opened) out.squadsOut = opened
  return Object.keys(out).length ? out : { skipped: 'Nothing due' }
}

export async function cbManual(ctx: CbCtx, mode: string, matchId: string | null) {
  if (mode === 'sync-now') {
    const list = await cbList(ctx)
    const schedule = await cbSchedule(ctx)
    const live = await cbLivePass(ctx, 6)
    const info = await cbInfoPass(ctx, 24, true)
    await ctx.db.rpc('notify_squads_out')
    return { list, schedule, live: Object.keys(live).length, squadsChecked: Object.keys(info).length,
      message: `${list.found ?? 0} matches, ${Object.keys(info).length} squads checked, ${Object.keys(live).length} live updated` }
  }
  if (mode === 'list') return await cbList(ctx)
  if (mode === 'fixtures') return await cbSchedule(ctx)
  if ((mode === 'info' || mode === 'squad' || mode === 'squad-for-entry') && matchId?.startsWith('cb-')) {
    const { data: m } = await ctx.db.from('matches').select('cb_slug').eq('id', matchId).maybeSingle()
    const body = await cb(ctx, 'info', { id: matchId.slice(3) })
    if (!body) return { message: 'Cricbuzz didn’t answer. Try again in a minute.' }
    void m
    const r = await applyInfo(ctx, matchId, body.scorecard)
    await cbRoles(ctx, 1)
    return { ...r, message: r.players ? `${r.players} players loaded${r.xi ? ', Playing XI set' : ''}.` : 'Squads aren’t on Cricbuzz yet. Pro11 checks again automatically.' }
  }
  return null
}
