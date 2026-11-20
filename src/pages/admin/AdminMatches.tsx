import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { MatchReport } from '../../components/MatchReport'
import { TeamBadge } from '../../components/TeamBadge'
import { callFunction, errorText } from '../../lib/api'
import { shortTeam } from '../../lib/cricket'
import { istDayName, istTime } from '../../lib/ist'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { Category, DataSettings, Match, Visibility } from '../../lib/types'
import { filterMatches, useMatchFeed } from '../../lib/useMatches'
import { SkRows } from '../../components/Skeleton'

const CAT: Record<Category, string> = { international: 'International', league: 'League', domestic: 'Domestic', other: 'Other' }

function autoShown(m: Match, s: DataSettings | null): boolean {
  if (!s) return true
  if (m.is_women && !s.show_women_intl) return false      // same rule as the members' list: no women's cricket
  if (m.category === 'international') return s.show_men_intl
  if (m.category === 'league') return s.show_leagues
  return s.show_domestic
}

export function AdminMatches() {
  const settings = useAuth().settings as unknown as DataSettings | null
  const [reportKey, setReportKey] = useState(0)
  const toast = useToast()
  const { matches, loading, reload } = useMatchFeed('matches')
  const [tab, setTab] = useState<'Today' | 'Tomorrow' | 'Later' | 'Live'>('Today')
  const [busy, setBusy] = useState(false)
  const list = filterMatches(matches.filter((m) => m.id.startsWith('cb-')), tab, 'All', undefined, { liveAll: true })
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  useEffect(() => { void supabase.from('blocked_series').select('series_id').then(({ data }) => setBlocked(new Set((data ?? []).map((r: { series_id: string }) => r.series_id)))) }, [])

  const setVis = async (m: Match, v: Visibility) => {
    const { error } = await supabase.rpc('admin_set_match_visibility', { p_id: m.id, p_visibility: v })
    if (error) return toast(errorText(error))
    toast(v === 'auto' ? 'Following your filters' : v === 'shown' ? 'Shown in the app' : 'Hidden from the app')
    void reload()
  }

  const refresh = async () => {
    setBusy(true)
    try {
      const res = await callFunction<{ result: { message?: string } }>('sync-cricket', { mode: 'sync-now' })
      toast(res.result.message ?? 'Updated from Cricbuzz.')
      void reload(); setReportKey((k) => k + 1)
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t refresh') } finally { setBusy(false) }
  }

  return (
    <Shell title="Matches" back="/admin" kicker="What members see, and why"
      actions={<button className="btn sm primary" onClick={refresh} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="refresh" small />}<span>Refresh now</span></button>}>
      <MatchReport key={reportKey} />
      <div className="seg" style={{ maxWidth: 520 }}>
        {(['Today', 'Tomorrow', 'Later', 'Live'] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {loading && <SkRows n={6} avatar={false} />}
      {!loading && list.length === 0 && <Empty icon="stumps" title="No matches here">Tap Refresh now, or wait for the next automatic refresh.</Empty>}
      <div className="list" style={{ marginTop: 16 }}>
        {list.map((m) => {
          const shown = m.visibility === 'shown' || (m.visibility === 'auto' && autoShown(m, settings))
          return (
            <div key={m.id} className="panel">
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
                <span style={{ display: 'flex' }}>
                  <TeamBadge team={m.team_a} short={m.team_a_short} img={m.team_a_img} size={36} />
                  <span style={{ marginLeft: -10 }}><TeamBadge team={m.team_b} short={m.team_b_short} img={m.team_b_img} size={36} /></span>
                </span>
                <Link to={`/match/${m.id}`} style={{ textDecoration: 'none', minWidth: 0 }}>
                  <span className="rt">{shortTeam(m.team_a)} vs {shortTeam(m.team_b)}</span>
                  <span className="rs">{[m.label, m.format, `${istDayName(m.starts_at)} ${istTime(m.starts_at)}`].filter(Boolean).join(', ')}</span>
                </Link>
              </div>
              <div className="meta">
                <span className="tag">{CAT[m.category]}{m.is_women ? ', women' : ''}</span>
                <span className={shown ? 'tag ok' : 'tag warn'}>{shown ? 'Shown' : 'Hidden'}</span>
                {m.series_id && blocked.has(m.series_id) ? <span className="tag bad">League removed: no data</span>
                  : m.squad_fetched_at ? <span className="tag">Squads loaded</span>
                  : m.fantasy_ok && m.has_squad ? <span className="tag ok">Game data</span>
                  : <span className="tag warn">No game data</span>}
              </div>
              <Link className="btn sm" style={{ marginTop: 12 }} to={`/admin/match/${m.id}`}><Icon name="trophy" small /><span>Game status</span></Link>
              <div className="seg sm" style={{ marginTop: 12, maxWidth: 420 }} role="group" aria-label="Visibility">
                {(['auto', 'shown', 'hidden'] as const).map((v) => (
                  <button key={v} aria-pressed={m.visibility === v} onClick={() => setVis(m, v)}>
                    {v === 'auto' ? 'Follow filters' : v === 'shown' ? 'Always show' : 'Hide'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Shell>
  )
}
