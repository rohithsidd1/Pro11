import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import type { Contest, Entry, FantasyPick, GameKind, Match, MatchPlayer, PlayerPoints, XiPick } from './types'

/** One match's contest for a game: the contest (created on first look), everyone who joined, your entry and your picks. */
export function useContest(matchId: string, game: GameKind) {
  const { profile } = useAuth()
  const [contest, setContest] = useState<Contest | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [picks, setPicks] = useState<XiPick[]>([])
  const [team, setTeam] = useState<FantasyPick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // read the game; only ask the server to set it up if it doesn't exist yet and the match does
    let { data: c } = await supabase.from('contests').select('*').eq('match_id', matchId).eq('game', game).maybeSingle()
    if (!c) {
      const { data: m } = await supabase.from('matches').select('id').eq('id', matchId).maybeSingle()
      if (!m) { setError('This match no longer exists.'); setLoading(false); return }
      const made = await supabase.rpc('ensure_contest', { p_match: matchId, p_game: game })
      if (made.error || !made.data) { setError('Couldn’t load this game.'); setLoading(false); return }
      c = made.data
    }
    const ct = c as Contest
    const [en, pk] = await Promise.all([
      supabase.from('entries').select('*, who:profiles!entries_user_id_fkey(name, color)').eq('contest_id', ct.id).order('created_at'),
      game === 'xi'
        ? supabase.from('xi_picks').select('*, entries!inner(contest_id)').eq('entries.contest_id', ct.id)
        : supabase.from('fantasy_picks').select('*, entries!inner(contest_id)').eq('entries.contest_id', ct.id),
    ])
    setContest(ct)
    setEntries((en.data as Entry[] | null) ?? [])
    if (game === 'xi') setPicks(((pk.data as (XiPick & { entries?: unknown })[] | null) ?? []).map(({ entry_id, player_id, team }) => ({ entry_id, player_id, team })))
    else setTeam(((pk.data as (FantasyPick & { entries?: unknown })[] | null) ?? []).map(({ entry_id, player_id, team, role, captain, vice }) => ({ entry_id, player_id, team, role, captain, vice })))
    setError(null); setLoading(false)
  }, [matchId, game])

  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const t = window.setInterval(tick, 30000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [load])

  const mine = entries.find((e) => e.user_id === profile?.id) ?? null
  const myPicks = mine ? picks.filter((p) => p.entry_id === mine.id) : []
  const myTeam = mine ? team.filter((p) => p.entry_id === mine.id) : []
  return { contest, entries, picks, team, mine, myPicks, myTeam, loading, error, reload: load }
}

export function useMatchAndSquad(matchId: string) {
  const [match, setMatch] = useState<Match | null>(null)
  const [players, setPlayers] = useState<MatchPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const [m, p] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).maybeSingle(),
      supabase.from('match_players').select('*').eq('match_id', matchId).order('name'),
    ])
    setMatch(m.data as Match | null)
    setPlayers((p.data as MatchPlayer[] | null) ?? [])
    setLoading(false)
  }, [matchId])
  useEffect(() => { void load() }, [load])
  return { match, players, loading, reload: load }
}

export const ROLE_ORDER: MatchPlayer['role'][] = ['WK', 'BAT', 'AR', 'BOWL']
export const ROLE_LABEL: Record<MatchPlayer['role'], string> = { WK: 'Wicketkeeper', BAT: 'Batter', AR: 'All-rounder', BOWL: 'Bowler' }
export const ROLE_PLURAL: Record<MatchPlayer['role'], string> = { WK: 'Wicketkeepers', BAT: 'Batters', AR: 'All-rounders', BOWL: 'Bowlers' }

export function sortPlayers(list: MatchPlayer[]) {
  return [...list].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name))
}

/** Pot and status line for a contest. */
export function contestSummary(c: Contest | null, joined: number, minPlayers: number) {
  if (!c) return { pot: 0, line: '' }
  const pot = c.fee * joined
  const need = Math.max(0, minPlayers - joined)
  const line = c.status === 'open'
    ? need > 0 ? `Needs ${need} more ${need === 1 ? 'player' : 'players'} to start` : `${joined} joined`
    : c.status === 'locked' ? 'Locked, waiting for the Playing XI'
    : c.status === 'scored' ? 'Scores are in, provisional'
    : c.status === 'paid' ? 'Final'
    : `Cancelled: ${c.cancel_reason ?? 'refunded'}`
  return { pot, line }
}

/** Fantasy points per player for a match (live or final). */
export function usePlayerPoints(matchId: string) {
  const [points, setPoints] = useState<Map<string, PlayerPoints>>(new Map())
  useEffect(() => {
    const load = () => supabase.from('player_points').select('*').eq('match_id', matchId)
      .then(({ data }) => setPoints(new Map(((data as PlayerPoints[] | null) ?? []).map((p) => [p.player_id, p]))))
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60000)
    return () => window.clearInterval(t)
  }, [matchId])
  return points
}

/** Team rules from settings, with defaults. */
export function teamRules(s: unknown) {
  const r = (s ?? {}) as Partial<import('./types').TeamRules>
  return {
    maxPerSide: r.fx_max_per_side ?? 7,
    roles: {
      WK: [r.fx_wk_min ?? 1, r.fx_wk_max ?? 4], BAT: [r.fx_bat_min ?? 3, r.fx_bat_max ?? 6],
      AR: [r.fx_ar_min ?? 1, r.fx_ar_max ?? 4], BOWL: [r.fx_bowl_min ?? 3, r.fx_bowl_max ?? 6],
    } as Record<MatchPlayer['role'], [number, number]>,
    captain: Number(r.fx_captain_mult ?? 2), vice: Number(r.fx_vice_mult ?? 1.5),
  }
}
