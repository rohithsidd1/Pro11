// Pro11 · Cricbuzz reader (unofficial). Fetches public Cricbuzz pages and returns clean data.
//   POST (from the sync function, header x-proxy-token): { action: 'list' | 'schedule' | 'info' | 'scorecard' | 'roles', ... }
//   GET  /.netlify/functions/cricbuzz?debug=1[&id=123&slug=...]  → a readable health report (for the admin / Claude)
import { flightStats, headerFromJson, inningsFromJson, jsonText, parseMatchList, parseProfileRole, parseRoles, parseScorecard, squadsFromJson, text, type CbMatch, type Role } from '../../shared/cbparse.ts'
import { computePoints, rulesFor, type Rules } from '../../shared/points.ts'

// deno-lint-ignore no-explicit-any
const env = (k: string): string | undefined => (globalThis as any).process?.env?.[k] ?? (globalThis as any).Deno?.env?.get?.(k)
const WWW = () => env('CB_WWW') ?? 'https://www.cricbuzz.com'
const MOB = () => env('CB_M') ?? 'https://m.cricbuzz.com'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

interface Got { url: string; status: number; html: string; ms: number; error?: string }
async function get(url: string, ms = 7000): Promise<Got> {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-IN,en;q=0.9' }, signal: AbortSignal.timeout(ms), redirect: 'follow' })
    return { url, status: r.status, html: r.ok ? await r.text() : '', ms: Date.now() - t0 }
  } catch (e) {
    return { url, status: 0, html: '', ms: Date.now() - t0, error: String(e).slice(0, 140) }
  }
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const report = (g: Got, found: number) => ({ url: g.url.replace(/^https?:\/\/[^/]+/, ''), status: g.status, ms: g.ms, found, ...(g.error ? { error: g.error } : {}) })

function mergeLists(lists: CbMatch[][]): CbMatch[] {
  const by = new Map<string, CbMatch>()
  for (const l of lists) for (const m of l) {
    const cur = by.get(m.id) ?? { id: m.id }
    for (const [k, v] of Object.entries(m)) if (v !== undefined && v !== '' && (cur as unknown as Record<string, unknown>)[k] === undefined) (cur as unknown as Record<string, unknown>)[k] = v
    by.set(m.id, cur)
  }
  return [...by.values()]
}

/** Live, recent and starting-soon matches, from three places merged. */
async function list() {
  const pages = await Promise.all([
    get(`${WWW()}/api/html/matches-menu`), get(`${MOB()}/cricket-match/live-scores`), get(`${WWW()}/cricket-match/live-scores`),
    get(`${WWW()}/cricket-match/live-scores/upcoming-matches`),
  ])
  const parsed = pages.map((p) => parseMatchList(p.html))
  return { matches: mergeLists(parsed), sources: pages.map((p, i) => report(p, parsed[i].length)) }
}

/** Upcoming schedule pages (international, leagues, domestic, women). */
async function schedule() {
  const kinds = ['international', 'league', 'domestic', 'women']
  const pages = await Promise.all(kinds.map((k) => get(`${WWW()}/cricket-schedule/upcoming-series/${k}`)))
  const parsed = pages.map((p) => parseMatchList(p.html))
  return { matches: mergeLists(parsed), sources: pages.map((p, i) => report(p, parsed[i].length)) }
}

/**
 * Scorecard + match info + squads/Playing XI for one match.
 * Cricbuzz's old HTML API first; then the current scorecard page (innings) and squads page (teams, Playing XI).
 */
async function scorecardFor(id: string, slug?: string) {
  const legacy = await get(`${WWW()}/api/html/cricket-scorecard/${id}`, 3000)
  let sc = parseScorecard(legacy.html)
  const tried = [report(legacy, sc.innings.length + sc.teams.length)]
  if (slug && (!sc.teams.length || !sc.innings.length)) {
    const [card, squads] = await Promise.all([
      get(`${WWW()}/live-cricket-scorecard/${id}/${slug}`, 5000), get(`${WWW()}/cricket-match-squads/${id}/${slug}`, 5000),
    ])
    const fromCard = parseScorecard(card.html)
    const inns = fromCard.innings.length && fromCard.innings.some((i) => i.bowling.length) ? fromCard.innings : inningsFromJson(card.html)
    const teams = squadsFromJson(squads.html)
    const head = { ...headerFromJson(squads.html), ...Object.fromEntries(Object.entries(headerFromJson(card.html)).filter(([, v]) => v)) }
    tried.push(report(card, inns.length), report(squads, teams.reduce((n, t) => n + t.players.length, 0)))
    if (!sc.innings.length && inns.length) sc.innings = inns
    if (!sc.teams.length && teams.length) sc.teams = teams
    if (!sc.status) sc.status = head.status ?? fromCard.status
    if (!sc.toss && head.toss) sc.toss = head.toss
    if (!sc.startsAt && head.startsAt) sc.startsAt = head.startsAt
    sc.state = sc.state ?? head.state ?? fromCard.state
  }
  return { sc, sources: tried }
}

async function roles(players: { id: string; slug?: string }[], match?: { id: string; slug?: string }) {
  const out: Record<string, Role> = {}
  const sources = []
  if (match?.slug) {
    const sq = await Promise.all([WWW(), MOB()].map((base) => get(`${base}/cricket-match-squads/${match.id}/${match.slug}`, 4500)))
    for (const g of sq) { const r = parseRoles(g.html); sources.push(report(g, Object.keys(r).length)); Object.assign(out, r) }
  }
  const missing = players.filter((p) => !out[p.id]).slice(0, 8)
  const pages = await Promise.all(missing.map((p) => get(`${WWW()}/profiles/${p.id}/${p.slug ?? 'x'}`, 4500)))
  pages.forEach((g, i) => { const r = parseProfileRole(g.html); if (r) out[missing[i].id] = r })
  if (pages.length) sources.push({ url: '/profiles/…', status: pages.filter((p) => p.status === 200).length, found: pages.filter((_, i) => out[missing[i].id]).length, ms: Math.max(...pages.map((p) => p.ms)) })
  return { roles: out, sources }
}

export default async (req: Request) => {
  const url = new URL(req.url)

  // ---- health report you can open in a browser ----
  if (req.method === 'GET') {
    if (url.searchParams.has('raw')) {
      const path = url.searchParams.get('raw') ?? ''
      if (!/^\/(live-cricket-scorecard|cricket-match-squads|live-cricket-scores|cricket-scores|api\/html\/cricket-scorecard)\/\d+/.test(path)) return json({ error: 'Only Cricbuzz match pages.' }, 400)
      const g = await get(`${WWW()}${path}`, 8000)
      const jt = jsonText(g.html)
      const keys = (url.searchParams.get('keys') ?? 'bowl,playing,bench,toss,captain').split(',').filter(Boolean).slice(0, 8)
      const snippets: Record<string, string[]> = {}
      for (const k of keys) {
        const re = new RegExp(k.replace(/[^a-zA-Z0-9 ]/g, ''), 'gi'); const found: string[] = []
        for (const m of jt.matchAll(re)) { found.push(jt.slice(Math.max(0, (m.index ?? 0) - 160), (m.index ?? 0) + 340)); if (found.length >= 3) break }
        snippets[k] = found
      }
      return json({ status: g.status, bytes: g.html.length, jsonBytes: jt.length - g.html.length, flight: flightStats(g.html), innings: inningsFromJson(g.html).map((i) => `${i.team}: ${i.batting.length} bat, ${i.bowling.length} bowl`), snippets })
    }
    if (!url.searchParams.has('debug')) return json({ ok: true, hint: 'Add ?debug=1 for a health report.' })
    const id = url.searchParams.get('id') ?? undefined
    const slug = url.searchParams.get('slug') ?? undefined
    const l = await list()
    const out: Record<string, unknown> = {
      checkedAt: new Date().toISOString(),
      matchList: { total: l.matches.length, withStartTime: l.matches.filter((m) => m.startsAt).length, withTeams: l.matches.filter((m) => m.teamA).length, sources: l.sources,
        sample: l.matches.slice(0, 8).map((m) => `${m.id} ${m.teamA ?? m.teamAShort} v ${m.teamB ?? m.teamBShort} · ${m.desc ?? ''} · ${m.format} · ${m.state ?? '?'} · ${m.startsAt ?? 'no time'}`) },
    }
    const pick = id ? { id, slug } : l.matches.find((m) => m.state === 'live') ?? l.matches.find((m) => m.state === 'ended') ?? l.matches[0]
    if (pick) {
      const { sc, sources } = await scorecardFor(pick.id, pick.slug)
      out.scorecard = { match: pick.id, sources, status: sc.status, state: sc.state, startsAt: sc.startsAt, toss: sc.toss?.text, series: sc.series,
        teams: sc.teams.map((t) => `${t.name}: ${t.players.filter((p) => p.group === 'playing').length} playing, ${t.players.length} in squad`),
        innings: sc.innings.map((i) => `${i.team} ${i.score}: ${i.batting.length} batters, ${i.bowling.length} bowlers`) }
      const ps = sc.teams.flatMap((t) => t.players).slice(0, 4)
      const r = await roles(ps, pick)
      out.roles = { found: Object.keys(r.roles).length, of: ps.length, sources: r.sources }
    }
    out.verdict = l.matches.length ? 'Cricbuzz readable: match list OK.' : 'Cricbuzz gave no matches: see sources (status 403 = blocked, 200 with found 0 = page layout changed).'
    return json(out)
  }

  // ---- calls from Pro11's sync function ----
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const token = env('CRICKET_PROXY_TOKEN')
  if (!token || req.headers.get('x-proxy-token') !== token) return json({ error: 'Not allowed.' }, 401)
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string; slug?: string; format?: string; rules?: Partial<Record<string, Partial<Rules>>>; players?: { id: string; slug?: string }[]; roles?: Record<string, Role> }
  try {
    switch (body.action) {
      case 'list': return json(await list())
      case 'schedule': return json(await schedule())
      case 'info': {
        if (!body.id) return json({ error: 'id needed' }, 400)
        const { sc, sources } = await scorecardFor(body.id, body.slug)
        return json({ scorecard: sc, sources })
      }
      case 'scorecard': {
        if (!body.id) return json({ error: 'id needed' }, 400)
        const { sc, sources } = await scorecardFor(body.id, body.slug)
        const xi = sc.teams.flatMap((t) => t.players.filter((p) => p.group === 'playing').map((p) => p.id))
        const points = computePoints(sc, rulesFor(body.format ?? 'T20', body.rules), xi, body.roles ?? {})
        return json({ scorecard: sc, points, sources })
      }
      case 'roles': return json(await roles(body.players ?? [], body.id ? { id: body.id, slug: body.slug } : undefined))
      default: return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: `Cricbuzz reader failed: ${text(String(e)).slice(0, 160)}` }, 500)
  }
}
