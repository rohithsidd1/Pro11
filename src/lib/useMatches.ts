import { useCallback, useEffect, useState } from 'react'
import { istDayStart } from './ist'
import { supabase } from './supabase'
import type { Match } from './types'
import { useAuth } from './auth'
import { useLiveReload, useLiveVersion } from './live'

/** Upcoming matches (no end date) plus recent ones, from the member's feed. Re-reads every minute (no API cost). */
export function useMatchFeed(source: 'match_feed' | 'matches' = 'match_feed') {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from(source).select('*')
      .gte('starts_at', istDayStart(-5).toISOString())
      .order('starts_at', { ascending: true }).limit(500)
    if (err) setError('Couldn’t load matches.')
    else { setMatches((data as Match[] | null) ?? []); setError(null) }
    setLoading(false)
  }, [source])
  useLiveReload(['matches', 'contests', 'entries'], load)
  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const t = window.setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [load])
  return { matches, loading, error, reload: load }
}

export interface GameInfo { xiJoined: number; fxJoined: number; xiStatus: string | null; mine: boolean }

/** Who joined each match's games, for the cards. Reads only (no contests are created here). */
export function useGamesFor(matchIds: string[]) {
  const { profile } = useAuth()
  const [info, setInfo] = useState<Map<string, GameInfo>>(new Map())
  const key = matchIds.join(',')
  const v = useLiveVersion(['contests', 'entries'])
  useEffect(() => {
    if (!matchIds.length) { setInfo(new Map()); return }
    let alive = true
    void supabase.from('contests').select('match_id, game, status, entries(user_id)').in('match_id', matchIds).then(({ data }) => {
      if (!alive) return
      const m = new Map<string, GameInfo>()
      for (const c of (data ?? []) as { match_id: string; game: string; status: string; entries: { user_id: string }[] }[]) {
        const cur = m.get(c.match_id) ?? { xiJoined: 0, fxJoined: 0, xiStatus: null, mine: false }
        if (c.game === 'xi') { cur.xiJoined = c.entries.length; cur.xiStatus = c.status }
        if (c.game === 'fantasy') cur.fxJoined = c.entries.length
        if (c.entries.some((e) => e.user_id === profile?.id)) cur.mine = true
        m.set(c.match_id, cur)
      }
      setInfo(m)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, profile?.id, v])
  return info
}

export type DayTab = 'Today' | 'Tomorrow' | 'Later' | 'Live' | 'Mine'
export type FormatChip = 'All' | 'T20' | 'ODI' | 'Test'

/**
 * Today / Tomorrow / Later: matches that haven't started. Live: started and not finished; for members only the
 * ones they joined (pass `mine`), for the admin all of them. Mine: everything the member joined.
 */
export function filterMatches(all: Match[], tab: DayTab, chip: FormatChip, mine?: Set<string>, _opts: { liveAll?: boolean } = {}): Match[] {
  const t1 = istDayStart(1).getTime(), t2 = istDayStart(2).getTime()
  const upcoming = (m: Match) => !m.started && !m.ended
  const live = (m: Match) => m.started && !m.ended
  const byTab = all.filter((m) => {
    const s = new Date(m.starts_at).getTime()
    if (tab === 'Live') return live(m)
    if (tab === 'Mine') return mine?.has(m.id) ?? false
    if (tab === 'Today') return live(m) || (upcoming(m) && s < t1)   // live matches first (sorted below), then today's upcoming
    if (!upcoming(m)) return false
    if (tab === 'Tomorrow') return s >= t1 && s < t2
    return s >= t2
  })
  const byChip = byTab.filter((m) => chip === 'All' || m.format === chip)
  if (tab === 'Mine') {
    // live first, then upcoming soonest first, then finished most recent first
    const rank = (m: Match) => (live(m) ? 0 : upcoming(m) ? 1 : 2)
    return byChip.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)))
  }
  return byChip.sort((a, b) => (live(a) === live(b) ? 0 : live(a) ? -1 : 1) || a.starts_at.localeCompare(b.starts_at))
}
