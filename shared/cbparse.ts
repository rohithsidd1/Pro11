// Pro11 · Cricbuzz page readers (unofficial). Plain TypeScript: runs in Netlify (Node) and Deno tests.
// Every reader tries several layouts (Cricbuzz's legacy HTML APIs, its current pages, embedded JSON) and
// never throws: unknown pages give empty results, which the diagnostics page reports.

export type Fmt = 'T20' | 'ODI' | 'Test' | 'Other'
export type State = 'upcoming' | 'live' | 'ended'
export type Role = 'WK' | 'BAT' | 'AR' | 'BOWL'

export interface CbMatch {
  id: string; slug?: string; title?: string; teamA?: string; teamB?: string; teamAShort?: string; teamBShort?: string
  desc?: string; series?: string; seriesId?: string; format?: Fmt; state?: State; statusText?: string
  startsAt?: string; venue?: string
}
export interface CbPlayer { id: string; name: string; slug?: string; captain?: boolean; keeper?: boolean; group: 'playing' | 'bench' | 'squad' }
export interface CbTeam { name: string; players: CbPlayer[] }
export interface CbBat { id: string; name: string; dismissal: string; r: number; b: number; fours: number; sixes: number; out: boolean }
export interface CbBowl { id: string; name: string; overs: number; maidens: number; runs: number; wickets: number }
export interface CbInnings { team: string; score: string; r?: number; w?: number; o?: number; batting: CbBat[]; bowling: CbBowl[]; dnb: string[] }
export interface CbScorecard {
  status: string; state?: State; toss?: { text: string; winner?: string; choice?: string }
  startsAt?: string; venue?: string; label?: string; series?: string; teams: CbTeam[]; innings: CbInnings[]
}

// ---------------- small helpers ----------------
export function decode(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}
export const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const num = (s: string | undefined) => { const n = parseFloat(String(s ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0 }
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')); return m ? decode(m[1]) : undefined }
/** Merge objects left to right, ignoring undefined / empty values (so a blank field never hides a known one). */
const merge = <T extends object>(...objs: Partial<T>[]): Partial<T> => {
  const out: Record<string, unknown> = {}
  for (const o of objs) for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v
  return out as Partial<T>
}
const tsIso = (ms: string | number | undefined) => { const n = Number(ms); return n > 1e11 && n < 1e14 ? new Date(n).toISOString() : undefined }

export function stateFrom(s: string | undefined): State | undefined {
  const t = (s ?? '').toLowerCase()
  if (!t) return undefined
  if (/\bwon\b|\bwin\b|drawn|\bdraw\b|abandon|no result|\btied\b|complete|cancel|walkover|forfeit/.test(t)) return 'ended'
  if (/preview|upcoming|starts|yet to begin|scheduled|\bat \d/.test(t)) return 'upcoming'
  if (/live|innings break|lunch|\btea\b|stumps|toss|opt to|elected|day \d|session|need|trail|lead|rain|delay|drinks|in progress|\d+\/\d+|\d+-\d+/.test(t)) return 'live'
  return undefined
}

export function formatFrom(desc = '', series = '', title = ''): Fmt {
  const s = `${desc} ${series} ${title}`.toLowerCase()
  if (/\btest\b|first[- ]class|ranji|sheffield shield|county championship|duleep|irani|plunket shield|quaid/.test(s)) return 'Test'
  if (/\bodi\b|one[- ]day|list a|vijay hazare|50[- ]over|royal london|marsh cup|ford trophy|super50/.test(s)) return 'ODI'
  if (/t20|t10|twenty20|hundred|premier league|big bash|\bbbl\b|\bpsl\b|\bcpl\b|sa20|ilt20|\bmlc\b|super smash|blast|mushtaq|\bipl\b|\bwpl\b|lanka premier|bangladesh premier/.test(s)) return 'T20'
  return 'Other'
}

export function roleCode(s: string | undefined): Role | undefined {
  const t = (s ?? '').toLowerCase()
  if (!t) return undefined
  if (/wk|keeper/.test(t)) return 'WK'
  if (/all[- ]?rounder/.test(t)) return 'AR'
  if (/bowl/.test(t)) return 'BOWL'
  if (/bat/.test(t)) return 'BAT'
  return undefined
}

/** "India v Australia, 1st T20I - Preview" or "India vs Australia, 1st T20I, Australia tour of India 2026" */
export function parseTitle(title: string): Partial<CbMatch> {
  let t = decode(title).replace(/\s*-\s*(live cricket score.*|scorecard.*|commentary.*)$/i, '').trim()
  let statusText: string | undefined
  const dash = t.lastIndexOf(' - ')
  if (dash > 0) { statusText = t.slice(dash + 3).trim(); t = t.slice(0, dash).trim() }
  const parts = t.split(',').map((x) => x.trim()).filter(Boolean)
  const vs = (parts[0] ?? '').split(/\s+(?:vs?\.?|v)\s+/i)
  if (vs.length !== 2) return { statusText }
  return { teamA: vs[0].trim(), teamB: vs[1].trim(), desc: parts[1], series: parts.slice(2).join(', ') || undefined, statusText, state: stateFrom(statusText) }
}

/** "ind-vs-aus-1st-t20i-australia-tour-of-india-2026" → IND / AUS, "1st T20I" */
export function parseSlug(slug: string): Partial<CbMatch> {
  const m = slug.match(/^([a-z0-9]+(?:-[a-z0-9]+)??)-vs-([a-z0-9]+(?:-[a-z0-9]+)??)-(.+)$/)
  if (!m) return {}
  const rest = m[3].split('-')
  const k = rest.findIndex((w) => /^(match|t20i?|odi|test|qualifier\d?|final|eliminator|semifinal|playoff|unofficial)$/.test(w))
  const descEnd = k >= 0 ? k + 1 : Math.min(2, rest.length)
  const title = (w: string[]) => w.map((x) => (/^(t20i?|odi|ipl|bbl|psl|cpl|wpl|icc|sa20|ilt20|mlc)$/.test(x) ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1))).join(' ')
  const seriesWords = rest.slice(descEnd)
  return { teamAShort: m[1].toUpperCase(), teamBShort: m[2].toUpperCase(), desc: title(rest.slice(0, descEnd)).replace(/T20I/i, 'T20I'),
    series: seriesWords.length ? title(seriesWords) : undefined }
}

// ---------------- embedded JSON (Cricbuzz's current Next.js pages) ----------------
/** All text that may hold JSON: plain HTML, Next.js flight data (self.__next_f.push) unescaped, __NEXT_DATA__. */
/** Decodes a JavaScript string literal's contents (\\" \\n \\uXXXX \\xXX \\' …), which JSON.parse can't always do. */
export function decodeJs(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e: string) =>
    e[0] === 'u' || e[0] === 'x' ? String.fromCharCode(parseInt(e.slice(1), 16))
      : ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' } as Record<string, string>)[e] ?? e)
}

const FLIGHT = /self\.__next_f\.push\(\[\d+,\s*"((?:[^"\\]|\\.)*)"\]\)/g

/** Page data as one text: plain HTML, Next.js flight data (all pieces joined, every escape style decoded), __NEXT_DATA__. */
export function jsonText(html: string): string {
  // Next.js streams its page data in pieces that can cut through the middle of an object: join them as they are.
  let flight = ''
  for (const m of html.matchAll(FLIGHT)) flight += decodeJs(m[1])
  let out = html + '\n' + flight
  const nd = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (nd) out += '\n' + nd[1]
  return out
}

/** For diagnostics: how the page data decoded. */
export function flightStats(html: string) {
  const chunks = [...html.matchAll(FLIGHT)].map((m) => m[1])
  let jsonFails = 0
  for (const c of chunks) { try { JSON.parse(`"${c}"`) } catch { jsonFails++ } }
  const flight = chunks.map(decodeJs).join('')
  return { chunks: chunks.length, chunksJsonWouldFail: jsonFails, flightChars: flight.length,
    inningsIds: [...new Set([...flight.matchAll(/"inningsId"\s*:\s*(\d+)/g)].map((m) => m[1]))] }
}

/** Balanced JSON objects that start at each match of `start` (a regex ending just before '{'). */
export function objectsAt(src: string, start: RegExp, max = 400): unknown[] {
  const out: unknown[] = []
  const re = new RegExp(start.source, start.flags.includes('g') ? start.flags : start.flags + 'g')
  for (const m of src.matchAll(re)) {
    let i = (m.index ?? 0) + m[0].length
    while (i < src.length && src[i] !== '{') i++
    if (src[i] !== '{') continue
    let depth = 0, inStr = false, esc = false, j = i
    for (; j < src.length && j < i + 3000000; j++) {
      const c = src[j]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) break }
    }
    try { out.push(JSON.parse(src.slice(i, j + 1))) } catch { /* skip */ }
    if (out.length >= max) break
  }
  return out
}

// deno-lint-ignore no-explicit-any
function fromMatchInfo(mi: any): CbMatch | null {
  if (!mi?.matchId) return null
  const t1 = mi.team1 ?? {}, t2 = mi.team2 ?? {}
  const desc = mi.matchDesc, series = mi.seriesName
  return {
    id: String(mi.matchId), seriesId: mi.seriesId ? String(mi.seriesId) : undefined, series, desc,
    teamA: t1.teamName ?? t1.name, teamB: t2.teamName ?? t2.name, teamAShort: t1.teamSName ?? t1.shortName, teamBShort: t2.teamSName ?? t2.shortName,
    format: ({ T20: 'T20', ODI: 'ODI', TEST: 'Test', T10: 'T20', HUNDRED: 'T20' } as Record<string, Fmt>)[String(mi.matchFormat ?? '').toUpperCase()] ?? formatFrom(desc, series),
    state: stateFrom(mi.state) ?? stateFrom(mi.status), statusText: mi.status ?? mi.state,
    startsAt: tsIso(mi.startDate ?? mi.startTime), venue: [mi.venueInfo?.ground, mi.venueInfo?.city].filter(Boolean).join(', ') || undefined,
  }
}

// ---------------- match lists ----------------
/** Any Cricbuzz page that lists matches: legacy menu, mobile live-scores, schedules, series pages. */
export function parseMatchList(html: string): CbMatch[] {
  const byId = new Map<string, CbMatch>()
  const put = (m: CbMatch) => {
    const cur = byId.get(m.id) ?? { id: m.id }
    for (const [k, v] of Object.entries(m)) if (v !== undefined && v !== '' && (cur as unknown as Record<string, unknown>)[k] === undefined) (cur as unknown as Record<string, unknown>)[k] = v
    byId.set(m.id, cur)
  }
  // 1) embedded JSON match objects (most reliable when present)
  const jt = jsonText(html)
  for (const o of objectsAt(jt, /"matchInfo"\s*:\s*/)) { const m = fromMatchInfo(o); if (m) put(m) }
  for (const o of objectsAt(jt, /(?=\{"matchId"\s*:)/)) { const m = fromMatchInfo(o); if (m?.teamA) put(m) }
  // 2) links to match pages, with their title and nearby start time
  const re = /<a\b([^>]*href="[^"]*\/(?:live-cricket-scores|cricket-scores|live-cricket-scorecard|cricket-match-squads)\/(\d+)\/([a-z0-9-]+)"[^>]*)>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const [, tag, id, slug, inner] = m
    const title = attr(tag, 'title') ?? ''
    const fromTitle = parseTitle(title || text(inner))
    const near = html.slice(Math.max(0, (m.index ?? 0) - 600), (m.index ?? 0) + m[0].length + 900)
    const ts = near.match(/timestamp="(\d{12,13})"/) ?? near.match(/"startDate"\s*:\s*"?(\d{12,13})/)
    const innerText = text(inner)
    put(merge<CbMatch>({ id, slug, title: title || undefined }, parseSlug(slug), fromTitle, {
      state: fromTitle.state ?? stateFrom(innerText), statusText: fromTitle.statusText ?? (innerText.length < 120 ? innerText : undefined),
      startsAt: ts ? tsIso(ts[1]) : undefined }) as CbMatch)
  }
  const out = [...byId.values()]
  for (const m of out) if (!m.format || m.format === 'Other') m.format = formatFrom(m.desc, m.series, `${m.title ?? ''} ${m.slug ?? ''}`)
  return out.filter((m) => m.teamA || m.teamAShort || m.slug)
}

// ---------------- scorecard (legacy HTML API /api/html/cricket-scorecard/{id}) ----------------
function players(html: string, group: CbPlayer['group']): CbPlayer[] {
  const out: CbPlayer[] = []
  for (const m of html.matchAll(/<a\b([^>]*href="[^"]*\/profiles\/(\d+)\/([a-z0-9-]*)"[^>]*)>([\s\S]*?)<\/a>/gi)) {
    const label = text(m[4])
    const name = (attr(m[1], 'title') ?? '').replace(/^View profile of\s*/i, '') || label.replace(/\(.*?\)/g, '').trim()
    out.push({ id: m[2], slug: m[3], name: name.trim(), captain: /\(c\b|\bc &|\(c\)/i.test(label), keeper: /wk\)/i.test(label), group })
  }
  return out
}

export function parseScorecard(html: string): CbScorecard {
  const sc: CbScorecard = { status: '', teams: [], innings: [] }
  const st = html.match(/cb-scrcrd-status[^>]*>([\s\S]*?)<\/div>/)
  sc.status = st ? text(st[1]) : ''
  // match info rows
  for (const m of html.matchAll(/cb-mtch-info-itm[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g)) {
    const label = text(m[1]).toLowerCase(), raw = m[2], val = text(raw)
    if (label === 'match' && val) { const p = val.split(',').map((x) => x.trim()); sc.label = p[1]; sc.series = p.slice(2).join(', ') || undefined }
    else if (label === 'date' || label === 'time') { const ts = raw.match(/timestamp="(\d{12,13})"/); if (ts && !sc.startsAt) sc.startsAt = tsIso(ts[1]) }
    else if (label === 'toss' && val) { const t = val.match(/^(.*?)\s+won the toss and (?:opt|opted|elect|elected|chose) to (bat|bowl|field)/i); sc.toss = { text: val, winner: t?.[1], choice: t?.[2] } }
    else if (label === 'venue' && val) sc.venue = val
  }
  // squads: "<Team> Squad" headers, then Playing / Bench / Squad rows
  const heads = [...html.matchAll(/cb-minfo-tm-nm[^>]*>([^<]*?)\s*Squad\s*<\/div>/gi)]
  heads.forEach((h, i) => {
    const from = (h.index ?? 0) + h[0].length
    const to = i + 1 < heads.length ? heads[i + 1].index ?? html.length : Math.min(html.length, from + 30000)
    const block = html.slice(from, to)
    const team: CbTeam = { name: decode(h[1]).trim(), players: [] }
    for (const r of block.matchAll(/cb-minfo-tm-nm[^>]*>\s*<div[^>]*>\s*([A-Za-z ]+?)\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g)) {
      const lab = r[1].toLowerCase()
      const g: CbPlayer['group'] = /playing/.test(lab) ? 'playing' : /bench|sub/.test(lab) ? 'bench' : 'squad'
      team.players.push(...players(r[2], g))
    }
    if (team.name && team.players.length) sc.teams.push(team)
  })
  // innings
  const parts = html.split(/<div id="innings_\d+"[^>]*>/).slice(1)
  for (const part of parts) {
    const hdr = part.match(/cb-scrd-hdr-rw[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/)
    const inn: CbInnings = { team: hdr ? text(hdr[1]).replace(/\s*(1st|2nd)?\s*Innings$/i, '').trim() : '', score: hdr ? text(hdr[2]) : '', batting: [], bowling: [], dnb: [] }
    const sm = inn.score.match(/(\d+)(?:[-/](\d+))?\s*\(\s*([\d.]+)\s*Ov/i)
    if (sm) { inn.r = Number(sm[1]); inn.w = sm[2] !== undefined ? Number(sm[2]) : 10; inn.o = Number(sm[3]) }
    const rows = part.split(/<div class="cb-col cb-col-100 cb-scrd-itms\s*"[^>]*>/).slice(1)
      // a row ends where the next section starts (Fall of Wickets, Powerplays, the bowling header…)
      .map((r) => r.split(/cb-scrd-sub-hdr|cb-scrd-hdr-rw|cb-ltst-wgt-hdr|cb-col-rt cb-font-13/)[0])
    for (const row of rows) {
      const link = row.match(/\/profiles\/(\d+)\/[a-z0-9-]*"[^>]*>([\s\S]*?)<\/a>/)
      if (/did not bat|yet to bat/i.test(text(row.slice(0, 400)))) { inn.dnb.push(...players(row, 'playing').map((p) => p.id)); continue }
      if (!link) continue
      const name = text(link[2]).replace(/\(.*?\)/g, '').trim()
      const nums = [...row.matchAll(/<div class="cb-col cb-col-(?:8|10)[^"]*"[^>]*>\s*([\d.]+)\s*<\/div>/g)].map((x) => x[1])
      if (/cb-col-27/.test(row) && /cb-col-33/.test(row)) {
        const dm = row.match(/cb-col-33[^>]*>\s*(?:<span[^>]*>)?([\s\S]*?)(?:<\/span>)?\s*<\/div>/)
        const dismissal = dm ? text(dm[1]) : ''
        inn.batting.push({ id: link[1], name, dismissal, r: num(nums[0]), b: num(nums[1]), fours: num(nums[2]), sixes: num(nums[3]), out: !!dismissal && !/^not out$|^batting$/i.test(dismissal) })
      } else if (/cb-col-40/.test(row) && nums.length >= 4) {
        inn.bowling.push({ id: link[1], name, overs: num(nums[0]), maidens: num(nums[1]), runs: num(nums[2]), wickets: num(nums[3]) })
      }
    }
    if (inn.team || inn.batting.length) sc.innings.push(inn)
  }
  sc.state = stateFrom(sc.status) ?? (sc.innings.length ? 'live' : undefined)
  // newer pages: embedded JSON scorecard (Cricbuzz API shape), used only if the legacy layout gave nothing
  if (!sc.innings.length) Object.assign(sc, parseScorecardJson(html, sc))
  return sc
}

// deno-lint-ignore no-explicit-any
function parseScorecardJson(html: string, base: CbScorecard): Partial<CbScorecard> {
  const jt = jsonText(html)
  const innings: CbInnings[] = []
  // shape A: { batTeamDetails: { batTeamName, batsmenData: { bat_1: {...} } }, bowlTeamDetails: { bowlersData: {...} }, scoreDetails }
  for (const o of objectsAt(jt, /(?=\{"matchId"\s*:\s*\d+\s*,\s*"inningsId")|(?=\{"inningsId"\s*:)/)) {
    // deno-lint-ignore no-explicit-any
    const x = o as any
    const bat = x.batTeamDetails?.batsmenData ?? x.batsman ?? x.batsmen
    const bowl = x.bowlTeamDetails?.bowlersData ?? x.bowler ?? x.bowlers
    if (!bat || !bowl) continue
    // deno-lint-ignore no-explicit-any
    const bats = (Array.isArray(bat) ? bat : Object.values(bat)) as any[]
    // deno-lint-ignore no-explicit-any
    const bowls = (Array.isArray(bowl) ? bowl : Object.values(bowl)) as any[]
    innings.push({
      team: x.batTeamDetails?.batTeamName ?? x.batTeamName ?? '', score: '',
      r: x.scoreDetails?.runs ?? x.score, w: x.scoreDetails?.wickets ?? x.wickets, o: x.scoreDetails?.overs ?? x.overs,
      batting: bats.filter((b) => b?.batId || b?.id).map((b) => ({ id: String(b.batId ?? b.id), name: b.batName ?? b.name ?? '', dismissal: b.outDesc ?? b.outdec ?? '', r: num(b.runs), b: num(b.balls), fours: num(b.fours), sixes: num(b.sixes), out: !!(b.outDesc ?? b.outdec) && !/not out|batting/i.test(b.outDesc ?? b.outdec) })),
      bowling: bowls.filter((b) => b?.bowlId || b?.id).map((b) => ({ id: String(b.bowlId ?? b.id), name: b.bowlName ?? b.name ?? '', overs: num(b.overs), maidens: num(b.maidens), runs: num(b.runs), wickets: num(b.wickets) })),
      dnb: [],
    })
  }
  const mi = objectsAt(jt, /"matchHeader"\s*:\s*/)[0] as Record<string, unknown> | undefined
  return innings.length ? { innings, status: (mi?.status as string) ?? base.status, state: stateFrom(mi?.state as string) ?? stateFrom(mi?.status as string) ?? 'live' } : {}
}

// ---------------- squads page & profiles (roles) ----------------
/** Role per player id from a squads page (any layout): the role text that follows each player's link. */
export function parseRoles(html: string): Record<string, Role> {
  const out: Record<string, Role> = {}
  const jt = jsonText(html)
  for (const o of objectsAt(jt, /(?=\{"id"\s*:\s*\d+\s*,\s*"name")/, 400)) {
    // deno-lint-ignore no-explicit-any
    const p = o as any
    const r = roleCode(p.role ?? p.playerRole)
    if (p.id && r) out[String(p.id)] = r
  }
  for (const m of html.matchAll(/\/profiles\/(\d+)\/[a-z0-9-]*"[^>]*>([\s\S]{0,600}?)(?=\/profiles\/\d+\/|$)/gi)) {
    if (out[m[1]]) continue
    const r = roleCode(text(m[2]).match(/(WK-Batsman|WK-Batter|Wicket[- ]?keeper(?: Batter)?|Batting Allrounder|Bowling Allrounder|All[- ]?rounder|Batsman|Batter|Bowler)/i)?.[1])
    if (r) out[m[1]] = r
  }
  return out
}

/** Role from a player's profile page. */
export function parseProfileRole(html: string): Role | undefined {
  const jt = jsonText(html)
  const j = jt.match(/"role"\s*:\s*"([^"]+)"/)
  if (j && roleCode(j[1])) return roleCode(j[1])
  const t = text(html)
  const m = t.match(/Role\s*:?\s*(WK-Batsman|WK-Batter|Wicket[- ]?keeper(?: Batter)?|Batting Allrounder|Bowling Allrounder|All[- ]?rounder|Batsman|Batter|Bowler)/i)
  return roleCode(m?.[1])
}

// ---------------- current Cricbuzz pages (2026): read data by what it contains, not by field names ----------------
// deno-lint-ignore no-explicit-any
type J = any
const pick = (o: J, keys: string[]) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined }
const ID = ['id', 'playerId', 'batId', 'bowlId', 'batsmanId', 'bowlerId', 'batid', 'bowlid']
const NAME = ['name', 'fullName', 'playerName', 'batName', 'bowlName', 'batname', 'bowlname', 'nickName']

/** Every object inside a JSON value (depth-first), with the chain of keys that led to it. */
function walk(v: J, path: string[] = [], out: { o: J; path: string[] }[] = []): { o: J; path: string[] }[] {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, String(i)], out))
  else if (v && typeof v === 'object') { out.push({ o: v, path }); for (const [k, x] of Object.entries(v)) walk(x, [...path, k], out) }
  return out
}
const isBatter = (o: J) => pick(o, ID) !== undefined && ('balls' in o || 'b' in o) && ('runs' in o || 'r' in o) && !('overs' in o)
const isBowler = (o: J) => pick(o, ID) !== undefined && 'overs' in o && ('wickets' in o || 'w' in o)

/** Innings from any JSON scorecard shape: objects holding batters and bowlers. */
export function inningsFromJson(html: string): CbInnings[] {
  const roots = [...objectsAt(jsonText(html), /"scoreCard"\s*:\s*\[\s*(?=\{)/, 20), ...objectsAt(jsonText(html), /"scorecard"\s*:\s*\[\s*(?=\{)/, 20),
    ...objectsAt(jsonText(html), /(?=\{"inningsId"\s*:)|(?=\{"inningsid"\s*:)|(?=\{"matchId"\s*:\s*\d+\s*,\s*"inningsId")/, 40)]
  const seen = new Set<string>()
  const out: CbInnings[] = []
  for (const r of roots) {
    const root = r as J
    const nodes = walk(root)
    const bats = nodes.filter((n) => isBatter(n.o)).map((n) => n.o)
    const bowls = nodes.filter((n) => isBowler(n.o)).map((n) => n.o)
    if (!bats.length) continue
    const key = bats.map((b) => pick(b, ID)).join(',')
    if (seen.has(key)) continue
    seen.add(key)
    const team = String(pick(root, ['batTeamName', 'batteamname', 'teamName']) ?? pick(root.batTeamDetails, ['batTeamName']) ?? '')
    const sd = root.scoreDetails ?? root
    out.push({
      team, score: '', r: num(pick(sd, ['runs', 'score'])), w: num(pick(sd, ['wickets', 'wkts'])), o: num(pick(sd, ['overs'])),
      batting: bats.map((b) => {
        const dis = String(pick(b, ['outDesc', 'outdec', 'outDec', 'dismissal', 'dismissalText', 'outDescription']) ?? '')
        return { id: String(pick(b, ID)), name: String(pick(b, NAME) ?? ''), dismissal: dis, r: num(pick(b, ['runs', 'r'])), b: num(pick(b, ['balls', 'b'])),
          fours: num(pick(b, ['fours', '4s', 'boundaries'])), sixes: num(pick(b, ['sixes', '6s'])), out: !!dis && !/not out|batting/i.test(dis) }
      }),
      bowling: bowls.map((b) => ({ id: String(pick(b, ID)), name: String(pick(b, NAME) ?? ''), overs: num(pick(b, ['overs', 'o'])),
        maidens: num(pick(b, ['maidens', 'm'])), runs: num(pick(b, ['runs', 'r'])), wickets: num(pick(b, ['wickets', 'w'])) })),
      dnb: [],
    })
  }
  if (out.length < 2) {
    const jt = jsonText(html)
    const batT = objectsAt(jt, /"batTeamDetails"\s*:\s*/, 40) as J[]
    const bowlT = objectsAt(jt, /"bowlTeamDetails"\s*:\s*/, 40) as J[]
    const scores = objectsAt(jt, /"scoreDetails"\s*:\s*/, 40) as J[]
    batT.forEach((bt, k) => {
      const bats = walk(bt).filter((n) => isBatter(n.o)).map((n) => n.o)
      if (!bats.length) return
      const key = bats.map((b) => pick(b, ID)).join(',')
      if (seen.has(key)) return
      seen.add(key)
      const bowls = walk(bowlT[k] ?? {}).filter((n) => isBowler(n.o)).map((n) => n.o)
      const sd = scores[k] ?? {}
      out.push({
        team: String(pick(bt, ['batTeamName', 'teamName']) ?? ''), score: '', r: num(pick(sd, ['runs'])), w: num(pick(sd, ['wickets'])), o: num(pick(sd, ['overs'])),
        batting: bats.map((b) => {
          const dis = String(pick(b, ['outDesc', 'outdec', 'outDec', 'dismissal']) ?? '')
          return { id: String(pick(b, ID)), name: String(pick(b, NAME) ?? ''), dismissal: dis, r: num(pick(b, ['runs'])), b: num(pick(b, ['balls'])),
            fours: num(pick(b, ['fours'])), sixes: num(pick(b, ['sixes'])), out: !!dis && !/not out|batting/i.test(dis) }
        }),
        bowling: bowls.map((b) => ({ id: String(pick(b, ID)), name: String(pick(b, NAME) ?? ''), overs: num(pick(b, ['overs'])), maidens: num(pick(b, ['maidens'])), runs: num(pick(b, ['runs'])), wickets: num(pick(b, ['wickets'])) })),
        dnb: [],
      })
    })
  }
  return out
}

/** For diagnostics: does each innings object on the page read, and if not, why. */
export function inningsDiag(html: string) {
  const jt = jsonText(html)
  const out: { at: number; ok: boolean; chars: number; error?: string }[] = []
  for (const m of jt.matchAll(/(?=\{"matchId"\s*:\s*\d+\s*,\s*"inningsId")/g)) {
    const i = m.index ?? 0
    let depth = 0, inStr = false, esc = false, j = i
    for (; j < jt.length; j++) {
      const c = jt[j]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break }
    }
    try { JSON.parse(jt.slice(i, j + 1)); out.push({ at: i, ok: true, chars: j + 1 - i }) }
    catch (e) { out.push({ at: i, ok: false, chars: j + 1 - i, error: String(e).slice(0, 160) + ' … ' + jt.slice(Math.max(i, j - 60), j + 1).slice(0, 80) }) }
    if (out.length >= 8) break
  }
  return out
}

/**
 * Squads and Playing XI from a current squads page: player objects (id + name), grouped by team and by the
 * nearest list they sit in ("playing XI", "bench", "squad"…), whatever the exact layout.
 */
export function squadsFromJson(html: string): CbTeam[] {
  const jt = jsonText(html)
  const teams = new Map<string, CbTeam>()
  const groupOf = (p: string[]) => {
    const s = p.join('/').toLowerCase()
    return /playing ?xi|playingxi|playing11/.test(s) ? 'playing' as const : /bench|substitute|sub\b/.test(s) ? 'bench' as const : 'squad' as const
  }
  for (const root of objectsAt(jt, /(?=\{"(?:team1|teamDetails|team|squads?|players?|player)"\s*:)/, 60) as J[]) {
    for (const n of walk(root)) {
      const o = n.o
      if (pick(o, ['id', 'playerId']) === undefined || !pick(o, ['name', 'fullName']) || !('role' in o || 'captain' in o || 'keeper' in o || 'isCaptain' in o)) continue
      // team: a field on the player, else the nearest team object above it in the path (team1 / team2 …)
      let team = String(pick(o, ['teamName', 'teamSName']) ?? '')
      if (!team) { const t = n.path.find((k) => /^team[12]$|^team$/i.test(k)); team = t ?? 'team' }
      const t = teams.get(team) ?? { name: team, players: [] }
      const id = String(pick(o, ['id', 'playerId']))
      if (t.players.some((p) => p.id === id)) continue
      let group = groupOf(n.path)
      if (group === 'squad' && o.substitute === true) group = 'bench'
      t.players.push({ id, name: String(pick(o, ['fullName', 'name'])), captain: !!(o.captain ?? o.isCaptain), keeper: !!(o.keeper ?? o.isKeeper), group })
      teams.set(team, t)
    }
    if (teams.size >= 2) break
  }
  // "substitute" layout: once some players are marked substitute, the other 11 are the Playing XI
  for (const t of teams.values()) {
    const sq = t.players.filter((p) => p.group === 'squad'), bench = t.players.filter((p) => p.group === 'bench')
    if (!t.players.some((p) => p.group === 'playing') && sq.length === 11 && bench.length > 0) sq.forEach((p) => { p.group = 'playing' })
  }
  // if team names were only "team1"/"team2", take real names from team objects in the page
  const named = objectsAt(jt, /"team[12]"\s*:\s*/, 10).map((t) => String((t as J)?.teamName ?? (t as J)?.name ?? '')).filter(Boolean)
  const list = [...teams.values()]
  list.forEach((t, i) => { if (/^team[12]?$/i.test(t.name) && named[i]) t.name = named[i] })
  return list
}

/** Toss and status from any JSON on a match page. */
export function headerFromJson(html: string): { toss?: { text: string; winner?: string; choice?: string }; status?: string; state?: State; startsAt?: string } {
  const jt = jsonText(html)
  const out: { toss?: { text: string; winner?: string; choice?: string }; status?: string; state?: State; startsAt?: string } = {}
  const tr = objectsAt(jt, /"tossResults"\s*:\s*/, 3)[0] as J
  if (tr?.tossWinnerName) {
    const choice = /bowl|field/i.test(String(tr.decision ?? '')) ? 'bowl' : 'bat'
    out.toss = { text: `${tr.tossWinnerName} won the toss and opt to ${choice}`, winner: tr.tossWinnerName, choice }
  }
  const mh = (objectsAt(jt, /"matchHeader"\s*:\s*/, 2)[0] ?? objectsAt(jt, /"matchInfo"\s*:\s*/, 2)[0]) as J
  if (mh) { out.status = mh.status; out.state = stateFrom(mh.state) ?? stateFrom(mh.status); out.startsAt = tsIso(mh.matchStartTimestamp ?? mh.startDate) }
  return out
}
