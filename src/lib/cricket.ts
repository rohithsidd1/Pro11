import type { InningScore, Match } from './types'

/** Teams we draw a real flag for (symbols live in index.html). */
const FLAGS: Record<string, string> = {
  india: 'ind', 'south africa': 'sa', australia: 'aus', 'new zealand': 'nz', pakistan: 'pak', bangladesh: 'ban', england: 'eng',
}

export function flagFor(team: string): string | null {
  const base = team.replace(/\bwomen\b/i, '').replace(/\s+/g, ' ').trim().toLowerCase()
  return FLAGS[base] ?? null
}

export function initials(team: string, short?: string | null): string {
  if (short) return short.slice(0, 4).toUpperCase()
  const words = team.replace(/\bwomen\b/i, '').trim().split(/\s+/)
  return (words.length > 1 ? words.map((w) => w[0]).join('') : team.slice(0, 3)).slice(0, 3).toUpperCase()
}

const PALETTE = ['#1F5FC9', '#0D6E3B', '#C8102E', '#7A1F3D', '#2C4C9C', '#B5262B', '#0B6B35', '#1C3F94', '#6B3FA0', '#C0570C']
export function teamColor(team: string): string {
  let h = 0
  for (const c of team) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/** Short team name for small spaces: "India W" for women's sides. */
export function shortTeam(team: string): string {
  return team.replace(/\bWomen\b/i, 'W')
}

export function scoreFor(match: Match, team: string): InningScore[] {
  const t = team.toLowerCase()
  return (match.score ?? []).filter((s) => (s.inning ?? '').toLowerCase().startsWith(t))
}

export function scoreText(s: InningScore): string {
  const w = s.w ?? 0
  return `${s.r ?? 0}${w >= 10 ? '' : `/${w}`}`
}

export const isLive = (m: Match) => m.started && !m.ended

export const CARD_COLORS = ['pink', 'blue', 'mint', 'coral'] as const
