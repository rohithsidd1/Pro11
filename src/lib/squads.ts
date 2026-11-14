import type { Match } from './types'

export const hasGameData = (m: Match) => Boolean(m.fantasy_ok && m.has_squad)

/** Whether opening a game may trigger the one-time squad load (series squad first, so usually 1 credit). */
export const canAutoLoadSquad = (m: Match) => Boolean((hasGameData(m) || m.series_id) && !m.squad_attempted_at && !m.squad_fetched_at)
