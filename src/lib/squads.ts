import type { Match } from './types'

export const hasGameData = (m: Match) => Boolean(m.fantasy_ok && m.has_squad)

/** Whether opening a game may trigger the one-time squad load (series squad first, so usually 1 credit). */
/** Cricbuzz matches whose squads aren't in yet: a member who joins can ask for a fresh check. */
export const canAutoLoadSquad = (m: Match) => m.id.startsWith('cb-') && !m.has_squad && !m.squad_fetched_at
