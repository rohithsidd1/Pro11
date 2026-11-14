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

export function parseMatch(m: Raw, nowIso: string): { match: MatchRow; teams: TeamRow[] } | null {
  const teams: string[] = Array.isArray(m?.teams) ? m.teams.map(String) : []
  const startsAt = toIso(m?.dateTimeGMT ?? m?.date)
  if (!m?.id || teams.length < 2 || !startsAt) return null
  const [a, b] = teams
  const info: Raw[] = Array.isArray(m.teamInfo) ? m.teamInfo : []
  const ti = (n: string) => info.find((t) => String(t?.name).toLowerCase() === n.toLowerCase())
  const parts = String(m.name ?? `${a} vs ${b}`).split(',').map((s) => s.trim()).filter(Boolean)
  const name = String(m.name ?? `${a} vs ${b}`)

  const row: MatchRow = {
    id: String(m.id),
    name,
    label: parts[1] ?? null,
    series_name: parts.slice(2).join(', ') || null,
    series_id: m.series_id ?? null,
    match_type: m.matchType ?? null,
    format: FORMATS[String(m.matchType ?? '').toLowerCase()] ?? 'Other',
    category: categorize(name, a, b),
    is_women: /\bwomen\b/i.test(name) || teams.some((t) => /\bwomen\b/i.test(t)),
    venue: m.venue ?? null,
    starts_at: startsAt,
    team_a: a,
    team_b: b,
    team_a_short: ti(a)?.shortname ?? null,
    team_b_short: ti(b)?.shortname ?? null,
    team_a_img: ti(a)?.img ?? null,
    team_b_img: ti(b)?.img ?? null,
    status_text: m.status ?? null,
    started: Boolean(m.matchStarted),
    ended: Boolean(m.matchEnded),
    score: Array.isArray(m.score) ? m.score : [],
    has_squad: Boolean(m.hasSquad),
    fantasy_ok: Boolean(m.fantasyEnabled),
    last_synced_at: nowIso,
  }
  // Only overwrite toss/result when the source actually has them.
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

export interface PlayerRow {
  match_id: string; player_id: string; name: string; team: string; role: string; api_role: string | null
  img: string | null; updated_at: string
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
