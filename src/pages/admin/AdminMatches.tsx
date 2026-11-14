import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { TeamBadge } from '../../components/TeamBadge'
import { callFunction, errorText } from '../../lib/api'
import { shortTeam } from '../../lib/cricket'
import { istDayName, istTime } from '../../lib/ist'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { Category, DataSettings, Match, Visibility } from '../../lib/types'
import { useDataStatus } from '../../lib/useDataSettings'
import { filterMatches, useMatchFeed } from '../../lib/useMatches'

const CAT: Record<Category, string> = { international: 'International', league: 'League', domestic: 'Domestic', other: 'Other' }

function autoShown(m: Match, s: DataSettings | null): boolean {
  if (!s) return true
  if (m.category === 'international') return m.is_women ? s.show_women_intl : s.show_men_intl
  if (m.category === 'league') return s.show_leagues
  return s.show_domestic
}

export function AdminMatches() {
  const toast = useToast()
  const { matches, reload } = useMatchFeed('matches')
  const { settings, used, reload: reloadStatus } = useDataStatus()
  const [tab, setTab] = useState<'Today' | 'Tomorrow' | 'Live'>('Today')
  const [busy, setBusy] = useState(false)
  const list = filterMatches(matches, tab, 'All')

  const setVis = async (m: Match, v: Visibility) => {
    const { error } = await supabase.rpc('admin_set_match_visibility', { p_id: m.id, p_visibility: v })
    if (error) return toast(errorText(error))
    toast(v === 'auto' ? 'Following your filters' : v === 'shown' ? 'Shown in the app' : 'Hidden from the app')
    void reload()
  }

  const refresh = async () => {
    setBusy(true)
    try {
      const res = await callFunction<{ result: { saved: number } }>('sync-cricket', { mode: 'list' })
      toast(`${res.result.saved} matches updated`)
      void reload(); void reloadStatus()
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t refresh') } finally { setBusy(false) }
  }

  return (
    <Shell title="Matches" kicker="Show or hide matches"
      actions={<button className="btn sm primary" onClick={refresh} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="refresh" small />}<span>Refresh now</span></button>}>
      <p className="help" style={{ marginBottom: 14 }}>
        Credits used today: <b className="num">{used}</b> of <span className="num">{settings?.daily_credit_cap ?? 90}</span>. A refresh costs about <span className="num">1–2</span>.
        {' '}<Link to="/admin/data" className="textlink" style={{ minHeight: 0, fontSize: 12.5 }}>Cricket data settings</Link>
      </p>
      <div className="seg" style={{ maxWidth: 420 }}>
        {(['Today', 'Tomorrow', 'Live'] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {list.length === 0 && <Empty icon="stumps" title="No matches here">Tap Refresh now, or wait for the next automatic refresh.</Empty>}
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
                {m.squad_fetched_at && <span className="tag">Squads loaded</span>}
              </div>
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
