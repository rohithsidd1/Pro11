// Pro11 · Fantasy points from a scorecard. Plain TypeScript (Netlify + Deno tests).
// Defaults follow the common fantasy rules per format; the admin can change every number in Game rules.
import type { CbScorecard, Role } from './cbparse.ts'

export type Band = [number, number, number]   // [from, to, points], inclusive
export interface Rules {
  xi: number; run: number; four: number; six: number; b30: number; b50: number; b100: number; duck: number
  wicket: number; lbwBowled: number; w3: number; w4: number; w5: number; maiden: number
  catch: number; catch3: number; stumping: number; runoutDirect: number; runoutShared: number
  econMinOvers: number; econ: Band[]; srMinBalls: number; sr: Band[]
}
export const DEFAULT_RULES: Record<'T20' | 'ODI' | 'Test', Rules> = {
  T20: { xi: 4, run: 1, four: 1, six: 2, b30: 4, b50: 8, b100: 16, duck: -2, wicket: 25, lbwBowled: 8, w3: 4, w4: 8, w5: 16, maiden: 12,
    catch: 8, catch3: 4, stumping: 12, runoutDirect: 12, runoutShared: 6,
    econMinOvers: 2, econ: [[0, 4.99, 6], [5, 5.99, 4], [6, 7, 2], [10, 11, -2], [11.01, 12, -4], [12.01, 99, -6]],
    srMinBalls: 10, sr: [[170.01, 999, 6], [150.01, 170, 4], [130, 150, 2], [60, 70, -2], [50, 59.99, -4], [0, 49.99, -6]] },
  ODI: { xi: 4, run: 1, four: 1, six: 2, b30: 0, b50: 4, b100: 8, duck: -3, wicket: 25, lbwBowled: 8, w3: 0, w4: 4, w5: 8, maiden: 4,
    catch: 8, catch3: 4, stumping: 12, runoutDirect: 12, runoutShared: 6,
    econMinOvers: 5, econ: [[0, 2.49, 6], [2.5, 3.49, 4], [3.5, 4.5, 2], [7, 8, -2], [8.01, 9, -4], [9.01, 99, -6]],
    srMinBalls: 20, sr: [[140.01, 999, 6], [120.01, 140, 4], [100, 120, 2], [40, 50, -2], [30, 39.99, -4], [0, 29.99, -6]] },
  Test: { xi: 4, run: 1, four: 1, six: 2, b30: 0, b50: 4, b100: 8, duck: -4, wicket: 16, lbwBowled: 8, w3: 0, w4: 4, w5: 8, maiden: 0,
    catch: 8, catch3: 0, stumping: 12, runoutDirect: 12, runoutShared: 6,
    econMinOvers: 999, econ: [], srMinBalls: 9999, sr: [] },
}
export const rulesFor = (fmt: string, custom?: Partial<Record<string, Partial<Rules>>>): Rules => {
  const key = fmt === 'ODI' || fmt === 'Test' ? fmt : 'T20'
  return { ...DEFAULT_RULES[key], ...(custom?.[key] ?? {}) }
}

export interface PlayerPoints { points: number; bat: number; bowl: number; field: number; xi: number }

const norm = (s: string) => s.toLowerCase().replace(/[†*]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
const band = (v: number, bands: Band[]) => bands.find(([a, b]) => v >= a - 1e-9 && v <= b + 1e-9)?.[2] ?? 0
const ballsFromOvers = (o: number) => Math.floor(o) * 6 + Math.round((o % 1) * 10)

/** Finds a player by the short name used in dismissals ("Morgan", "Shahrukh Khan", "KL Rahul"). */
function finder(people: { id: string; name: string }[]) {
  const list = people.map((p) => ({ ...p, n: norm(p.name), last: norm(p.name).split(' ').pop() ?? '' }))
  return (raw: string): string | undefined => {
    const s = norm(raw)
    if (!s) return undefined
    const exact = list.filter((p) => p.n === s)
    if (exact.length === 1) return exact[0].id
    const last = list.filter((p) => p.last === s || p.last === s.split(' ').pop())
    if (last.length === 1) return last[0].id
    const contains = list.filter((p) => p.n.includes(s) || s.includes(p.last))
    return contains.length >= 1 ? contains[0].id : undefined
  }
}

/**
 * Points for every player in the match. `xiIds` are the Playing XI (both teams); `roles` (optional) avoids
 * charging ducks and strike-rate penalties to bowlers.
 */
export function computePoints(sc: CbScorecard, rules: Rules, xiIds: string[], roles: Record<string, Role> = {}, format?: string): Record<string, PlayerPoints> {
  const out: Record<string, PlayerPoints> = {}
  const get = (id: string) => (out[id] ??= { points: 0, bat: 0, bowl: 0, field: 0, xi: 0 })
  for (const id of xiIds) get(id).xi = rules.xi
  // super overs don't count: only the real innings (2 in a T20 or ODI, up to 4 in a Test)
  const real = format ? sc.innings.slice(0, /test/i.test(format) ? 4 : 2) : sc.innings
  // anyone who actually batted or bowled played, even if the lineup didn't list them (e.g. an impact player)
  for (const inn of real) {
    for (const b of inn.batting) if (b.b > 0 || b.out) get(b.id).xi = rules.xi
    for (const w of inn.bowling) if (w.overs > 0) get(w.id).xi = rules.xi
  }

  const allPlayers = sc.teams.flatMap((t) => t.players.map((p) => ({ id: p.id, name: p.name, team: t.name })))
  const catches: Record<string, number> = {}

  for (const inn of real) {
    // the fielding side is the team that isn't batting; fall back to everyone not batting in this innings
    const batIds = new Set([...inn.batting.map((b) => b.id), ...inn.dnb])
    const fielders = allPlayers.filter((p) => (inn.team ? norm(p.team) !== norm(inn.team) : true) && !batIds.has(p.id))
    const pool = fielders.length ? fielders : allPlayers.filter((p) => !batIds.has(p.id))
    const findFielder = finder([...pool, ...inn.bowling.map((b) => ({ id: b.id, name: b.name, team: '' }))])
    const findBowler = finder(inn.bowling.map((b) => ({ id: b.id, name: b.name })))

    // batting
    for (const b of inn.batting) {
      const p = get(b.id)
      let pts = b.r * rules.run + b.fours * rules.four + b.sixes * rules.six
      pts += b.r >= 100 ? rules.b100 : b.r >= 50 ? rules.b50 : b.r >= 30 ? rules.b30 : 0
      const bowler = roles[b.id] === 'BOWL'
      if (b.r === 0 && b.out && !bowler) pts += rules.duck
      if (b.b >= rules.srMinBalls && !bowler) pts += band((b.r / b.b) * 100, rules.sr)
      p.bat += pts

      // fielding and bowling bonuses from how the batter got out
      const d = b.dismissal.trim()
      let m: RegExpMatchArray | null
      if ((m = d.match(/^c\s*&\s*b\s+(.+)$/i))) {
        const id = findBowler(m[1]) ?? findFielder(m[1]); if (id) { get(id).field += rules.catch; catches[id] = (catches[id] ?? 0) + 1 }
      } else if ((m = d.match(/^c\s+(.+?)\s+b\s+(.+)$/i))) {
        if (!/^sub\b/i.test(m[1])) { const id = findFielder(m[1]); if (id) { get(id).field += rules.catch; catches[id] = (catches[id] ?? 0) + 1 } }
      } else if ((m = d.match(/^st\s+(.+?)\s+b\s+(.+)$/i))) {
        const id = findFielder(m[1]); if (id) get(id).field += rules.stumping
      } else if ((m = d.match(/^run out\s*\((.+?)\)/i))) {
        const names = m[1].split('/').map((x) => x.trim()).filter((x) => !/^sub\b/i.test(x))
        const ids = names.map((n) => findFielder(n)).filter(Boolean) as string[]
        if (ids.length === 1 && names.length === 1) get(ids[0]).field += rules.runoutDirect
        else for (const id of ids) get(id).field += rules.runoutShared
      } else if ((m = d.match(/^(?:lbw\s+)?b\s+(.+)$/i))) {
        const id = findBowler(m[1]); if (id) get(id).bowl += rules.lbwBowled
      }
    }
    // bowling
    for (const b of inn.bowling) {
      const p = get(b.id)
      let pts = b.wickets * rules.wicket + b.maidens * rules.maiden
      pts += b.wickets >= 5 ? rules.w5 : b.wickets >= 4 ? rules.w4 : b.wickets >= 3 ? rules.w3 : 0
      if (b.overs >= rules.econMinOvers && ballsFromOvers(b.overs) > 0) pts += band(b.runs / (ballsFromOvers(b.overs) / 6), rules.econ)
      p.bowl += pts
    }
  }
  for (const [id, n] of Object.entries(catches)) if (n >= 3) get(id).field += rules.catch3
  for (const p of Object.values(out)) p.points = p.bat + p.bowl + p.field + p.xi
  return out
}
