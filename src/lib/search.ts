/**
 * Smart search used everywhere in Pro11.
 *  • case, accents and punctuation don't matter ("Kohler-Cadmore" = "kohler cadmore")
 *  • every word you type must match, in any order ("eng aus" finds Australia v England)
 *  • a word can match the start of a word, a whole word, initials ("csk" → Chennai Super Kings) or, from 3 letters, any part
 *  • digits match inside phone numbers and amounts ("98765" finds +91 98765 43210)
 *  • best matches first: whole words beat starts of words, which beat initials, which beat parts
 */
const STOP = new Set(['v', 'vs', 'versus', 'and', 'the', 'of', '&'])
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim()

export function makeMatcher(query: string): ((fields: unknown[]) => number) | null {
  const tokens = norm(query).split(' ').filter((t) => t && !STOP.has(t))
  if (!tokens.length) return null
  return (fields) => {
    const parts = fields.map(norm).filter(Boolean)
    const words = parts.flatMap((p) => p.split(' '))
    const initials = parts.map((p) => p.split(' ').filter((w) => !STOP.has(w)).map((w) => w[0]).join(''))
    const text = parts.join(' ')
    const digits = text.replace(/\D/g, '')
    let score = 0
    for (const t of tokens) {
      let best = 0
      for (const w of words) { if (w === t) { best = 4; break } if (w.startsWith(t)) best = Math.max(best, 3 + t.length / w.length * 0.9) }
      if (best < 2 && t.length >= 2 && initials.some((i) => i.startsWith(t))) best = 2
      if (!best && /^\d{3,}$/.test(t) && digits.includes(t)) best = 2
      if (!best && t.length >= 3 && text.includes(t)) best = 1
      if (!best) return 0
      score += best
    }
    return score
  }
}

/** The items that match, best first (ties keep their original order). An empty query returns everything. */
export function smartFilter<T>(items: readonly T[], query: string, fields: (x: T) => unknown[]): T[] {
  const m = makeMatcher(query)
  if (!m) return [...items]
  return items.map((x, i) => ({ x, i, s: m(fields(x)) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((r) => r.x)
}

/** Words for a player role, so "keeper", "bowler", "allrounder" all work. */
export const roleWords = (r?: string | null) =>
  ({ WK: 'wicketkeeper keeper wk', BAT: 'batter batsman bat', AR: 'all rounder allrounder ar', BOWL: 'bowler bowl' } as Record<string, string>)[r ?? ''] ?? ''
