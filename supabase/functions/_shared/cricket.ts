// Turning CricketData responses into Pro11 rows. Tolerant of missing fields.

const NATIONS = new Set([
  'india', 'australia', 'england', 'south africa', 'new zealand', 'pakistan', 'sri lanka', 'bangladesh', 'west indies',
  'afghanistan', 'ireland', 'zimbabwe', 'scotland', 'netherlands', 'nepal', 'oman', 'uae', 'united arab emirates', 'namibia',
  'usa', 'united states of america', 'canada', 'hong kong', 'papua new guinea', 'kenya', 'uganda', 'italy', 'jersey',
])

const baseTeam = (t: string) =>
  t.replace(/\b(women|woman)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase()

const isSecondTeam = (t: string) => /\b(a|u19|under[- ]?19|u23|emerging|xi)\b/i.test(t)

export function categorize(name: string, a: string, b: string): 'international' | 'league' | 'domestic' | 'other' {
  const n = name.toLowerCase()
  const bothNations = NATIONS.has(baseTeam(a)) && NATIONS.has(baseTeam(b))
  if (bothNations && !isSecondTeam(a) && !isSecondTeam(b)) return 'international'
  if (/(premier league|big bash|super league|sa20|the hundred|caribbean premier|major league cricket|ilt20|\bipl\b|\bbbl\b|\bwbbl\b|\bpsl\b|\bcpl\b|\bbpl\b|\blpl\b|\bwpl\b|\bmlc\b|t20 league|t10|league)/.test(n)) return 'league'
  if (/(trophy|shield|ranji|duleep|deodhar|irani|hazare|mushtaq|county|plunket|sheffield|marsh cup|super smash|one-day cup|domestic)/.test(n)) return 'domestic'
  return 'other'
}

export function mapRole(r: unknown): 'WK' | 'BAT' | 'AR' | 'BOWL' {
  const x = String(r ?? '').toLowerCase()
  if (/wk|keeper/.test(x)) return 'WK'
  if (/all ?-?rounder/.test(x)) return 'AR'
  if (/bowl/.test(x)) return 'BOWL'
  return 'BAT'
}

const FORMATS: Record<string, string> = { t20: 'T20', t20i: 'T20', odi: 'ODI', test: 'Test' }

function toIso(v: unknown): string | null {
  if (!v) return null
  const s = String(v)
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : (s.length <= 10 ? `${s}T00:00:00Z` : `${s}Z`)
  const d = new Date(withZone)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// deno-lint-ignore no-explicit-any
type Raw = Record<string, any>

export interface MatchRow extends Raw { id: string }
export interface TeamRow { key: string; name: string; short_name?: string; img?: string; updated_at: string }

export function parseMatch(m: Raw, nowIso: string, seriesName?: string | null): { match: MatchRow; teams: TeamRow[] } | null {
  const teams: string[] = Array.isArray(m?.teams) ? m.teams.map(String) : []
  const startsAt = toIso(m?.dateTimeGMT ?? m?.date)
  if (!m?.id || teams.length < 2 || !startsAt) return null
  const [a, b] = teams
  const info: Raw[] = Array.isArray(m.teamInfo) ? m.teamInfo : []
  const ti = (n: string) => info.find((t) => String(t?.name).toLowerCase() === n.toLowerCase())
  const name = String(m.name ?? `${a} vs ${b}`)
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean)
  const has = (k: string) => Object.prototype.hasOwnProperty.call(m, k) && m[k] !== undefined && m[k] !== null

  // Always known
  const row: MatchRow = {
    id: String(m.id), name, starts_at: startsAt, team_a: a, team_b: b,
    format: FORMATS[String(m.matchType ?? '').toLowerCase()] ?? 'Other',
    category: categorize(name + (seriesName ? `, ${seriesName}` : ''), a, b),
    is_women: /\bwomen\b/i.test(name) || teams.some((t) => /\bwomen\b/i.test(t)),
    last_synced_at: nowIso,
  }
  // Only what this answer actually contains, so one list never blanks what another list filled in
  if (parts[1]) row.label = parts[1]
  const series = parts.slice(2).join(', ') || seriesName || null
  if (series) row.series_name = series
  if (has('series_id')) row.series_id = String(m.series_id)
  if (has('matchType')) row.match_type = m.matchType
  if (has('venue')) row.venue = m.venue
  if (has('status')) row.status_text = m.status
  if (has('matchStarted')) row.started = Boolean(m.matchStarted)
  if (has('matchEnded')) row.ended = Boolean(m.matchEnded)
  if (Array.isArray(m.score)) row.score = m.score
  if (has('hasSquad')) row.has_squad = Boolean(m.hasSquad)
  if (has('fantasyEnabled')) row.fantasy_ok = Boolean(m.fantasyEnabled)
  if (ti(a)?.shortname) row.team_a_short = ti(a)!.shortname
  if (ti(b)?.shortname) row.team_b_short = ti(b)!.shortname
  if (ti(a)?.img) row.team_a_img = ti(a)!.img
  if (ti(b)?.img) row.team_b_img = ti(b)!.img
  if (m.tossWinner !== undefined) row.toss_winner = m.tossWinner || null
  if (m.tossChoice !== undefined) row.toss_choice = m.tossChoice || null
  if (m.matchWinner !== undefined) row.winner = m.matchWinner || null

  const teamRows: TeamRow[] = info
    .filter((t) => t?.name)
    .map((t) => ({
      key: String(t.name).toLowerCase(), name: String(t.name),
      ...(t.shortname ? { short_name: String(t.shortname) } : {}),
      ...(t.img ? { img: String(t.img) } : {}),
      updated_at: nowIso,
    }))
  return { match: row, teams: teamRows }
}

/** Upserting a list whose rows have different fields would blank the missing ones; save rows grouped by their fields. */
export function groupByFields<T extends Record<string, unknown>>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const k = Object.keys(r).sort().join(',')
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
}

export interface PlayerRow {
  match_id: string; player_id: string; name: string; team: string; role: string; api_role: string | null
  img: string | null; updated_at: string
}

// CricketData doesn't document a Playing XI flag. If a squad response carries one of these, we use it.
const PLAYING_KEYS = ['playing11', 'playingXI', 'playingxi', 'isPlaying', 'is_playing', 'inPlaying11', 'playing', 'inXI', 'starting11']

/** Reads a "playing" flag from a squad player, if the API sent one. */
export function playingFlag(p: Raw): boolean | null {
  for (const k of PLAYING_KEYS) {
    if (k in p) {
      const v = p[k]
      if (typeof v === 'boolean') return v
      if (v === 1 || v === '1' || v === 'true' || v === 'yes' || v === 'Y') return true
      if (v === 0 || v === '0' || v === 'false' || v === 'no' || v === 'N') return false
    }
  }
  if ('substitute' in p && typeof p.substitute === 'boolean') return !p.substitute
  return null
}

/** Field names on the first player, logged so we can see what CricketData really sends. */
export function squadFieldNames(data: unknown): string {
  const sides: Raw[] = Array.isArray(data) ? data : []
  const first = sides.find((s) => Array.isArray(s?.players) && s.players.length)?.players?.[0]
  return first && typeof first === 'object' ? Object.keys(first).join(',') : ''
}

/** Playing XI from a squad response: only if exactly 11 per team are flagged. */
export function parseXi(data: unknown): Map<string, Set<string>> | null {
  const sides: Raw[] = Array.isArray(data) ? data : []
  const out = new Map<string, Set<string>>()
  for (const side of sides) {
    const team = String(side?.teamName ?? side?.name ?? '').trim()
    const players: Raw[] = Array.isArray(side?.players) ? side.players : []
    const xi = new Set(players.filter((p) => p?.id && playingFlag(p) === true).map((p) => String(p.id)))
    if (!team || xi.size !== 11) return null
    out.set(team, xi)
  }
  return out.size === 2 ? out : null
}

export function parseSquad(matchId: string, data: unknown, nowIso: string): PlayerRow[] {
  const sides: Raw[] = Array.isArray(data) ? data : []
  const rows: PlayerRow[] = []
  for (const side of sides) {
    const team = String(side?.teamName ?? side?.name ?? '').trim()
    const players: Raw[] = Array.isArray(side?.players) ? side.players : []
    for (const p of players) {
      if (!p?.id || !p?.name || !team) continue
      rows.push({
        match_id: matchId, player_id: String(p.id), name: String(p.name), team,
        role: mapRole(p.role), api_role: p.role ? String(p.role) : null,
        img: p.playerImg && !/icon512/.test(String(p.playerImg)) ? String(p.playerImg) : null,
        updated_at: nowIso,
      })
    }
  }
  return rows
}
