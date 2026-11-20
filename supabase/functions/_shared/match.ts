// Pro11: helpers for saving Cricbuzz matches (which kind of match it is, and saving rows safely).
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

/** Upserting a list whose rows have different fields would blank the missing ones; save rows grouped by their fields. */
export function groupByFields<T extends Record<string, unknown>>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const k = Object.keys(r).sort().join(',')
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
}
