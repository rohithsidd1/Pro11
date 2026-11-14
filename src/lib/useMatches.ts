import { useCallback, useEffect, useState } from 'react'
import { istDayStart } from './ist'
import { supabase } from './supabase'
import type { Match } from './types'

/** Matches from a few days back (multi-day Tests) through tomorrow, from the filtered feed. Re-reads every minute (no API cost). */
export function useMatchFeed(source: 'match_feed' | 'matches' = 'match_feed') {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from(source).select('*')
      .gte('starts_at', istDayStart(-5).toISOString()).lt('starts_at', istDayStart(2).toISOString())
      .order('starts_at', { ascending: true })
    if (err) setError('Couldn’t load matches.')
    else { setMatches((data as Match[] | null) ?? []); setError(null) }
    setLoading(false)
  }, [source])
  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const t = window.setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [load])
  return { matches, loading, error, reload: load }
}

export type DayTab = 'Today' | 'Tomorrow' | 'Live'
export type FormatChip = 'All' | 'T20' | 'ODI' | 'Test' | 'Women'

export function filterMatches(all: Match[], tab: DayTab, chip: FormatChip): Match[] {
  const t0 = istDayStart(0).getTime(), t1 = istDayStart(1).getTime(), t2 = istDayStart(2).getTime()
  const live = (m: Match) => m.started && !m.ended
  const byTab = all.filter((m) => {
    const s = new Date(m.starts_at).getTime()
    if (tab === 'Live') return live(m)
    if (tab === 'Tomorrow') return s >= t1 && s < t2
    return (s >= t0 && s < t1) || live(m)
  })
  const byChip = byTab.filter((m) => chip === 'All' || (chip === 'Women' ? m.is_women : m.format === chip))
  // live first, then by start time
  return byChip.sort((a, b) => Number(live(b)) - Number(live(a)) || a.starts_at.localeCompare(b.starts_at))
}
