import { useCallback, useEffect, useMemo, useState } from 'react'
import { errorText } from '../lib/api'
import { istDayName, istTime } from '../lib/ist'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Icon } from './Icon'

export interface ReportRow {
  id: string; name: string; series: string | null; category: string; format: string; starts_at: string; status_text: string | null
  shown: boolean; reason: string; hint: string; games_open: boolean; joined: number; fetched_at: string | null
}

export function useMatchReport() {
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_match_report')
    setRows((data as ReportRow[] | null) ?? [])
  }, [])
  useEffect(() => { void load() }, [load])
  return { rows, reload: load }
}

/** Counts by reason, e.g. "2 shown · 40 finished · 9 no fantasy data". */
export function reportSummary(rows: ReportRow[]): { reason: string; n: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.reason, (m.get(r.reason) ?? 0) + 1)
  return [...m.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => (a.reason === 'Shown' ? -1 : b.reason === 'Shown' ? 1 : b.n - a.n))
}

const CAN_SHOW = new Set(['Domestic matches are switched off', 'League matches are switched off', 'Women’s internationals are switched off', 'Men’s internationals are switched off', 'No fantasy data from CricketData', 'You hid it'])

/** Admin: every match Pro11 has from the last 3 days onwards, whether members see it, and exactly why not. */
export function MatchReport() {
  const toast = useToast()
  const { rows, reload } = useMatchReport()
  const [filter, setFilter] = useState<string>('All')
  const summary = useMemo(() => reportSummary((rows ?? []).filter((r) => r.reason !== 'Not from Cricbuzz')), [rows])
  if (!rows) return <p className="help">Loading…</p>
  const all = rows.filter((r) => r.reason !== 'Not from Cricbuzz')
  const list = all.filter((r) => filter === 'All' || r.reason === filter)
  const show = async (r: ReportRow) => {
    const { error } = await supabase.rpc('admin_set_match_visibility', { p_id: r.id, p_visibility: r.reason === 'You hid it' ? 'auto' : 'shown' })
    if (error) return toast(errorText(error))
    toast(r.reason === 'You hid it' ? 'Back to automatic' : 'Members can see it now'); void reload()
  }
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="ch"><h3>What members see, and why</h3><span className="help num">{all.length} matches</span></div>
      <p className="help" style={{ marginBottom: 10 }}>Every match Pro11 has from the last 3 days onwards. Uses exactly the same rules as the members’ list.</p>
      <div className="chips" role="group" aria-label="Filter by reason" style={{ flexWrap: 'wrap', width: 'auto' }}>
        <button className="chip" aria-pressed={filter === 'All'} onClick={() => setFilter('All')}>All <span className="num">{all.length}</span></button>
        {summary.map((s) => (
          <button key={s.reason} className="chip" aria-pressed={filter === s.reason} onClick={() => setFilter(s.reason)}>{s.reason} <span className="num">{s.n}</span></button>
        ))}
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {list.length === 0 && <p className="help">Nothing here.</p>}
        {list.map((r) => (
          <div key={r.id} className="row nolead" style={{ gridTemplateColumns: '1fr auto', background: 'var(--sand)', alignItems: 'start' }}>
            <span style={{ minWidth: 0 }}>
              <span className="rt">{r.name}</span>
              <span className="rs">{[r.series, r.format, `${istDayName(r.starts_at)} ${istTime(r.starts_at)}`, r.status_text].filter(Boolean).join(' · ')}</span>
              <span className="rs" style={{ color: 'var(--ink)', marginTop: 4 }}>
                <b>{r.shown ? (r.games_open ? 'Shown, games open' : 'Shown, squads soon') : r.reason}.</b> {r.hint}
              </span>
            </span>
            <span style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
              <span className={r.shown ? 'tag ok' : 'tag'}><span className="tx">{r.shown ? 'Members see it' : 'Hidden'}</span></span>
              {!r.shown && CAN_SHOW.has(r.reason) && <button className="btn sm" onClick={() => show(r)}><Icon name="eye" small /><span>{r.reason === 'You hid it' ? 'Unhide' : 'Show anyway'}</span></button>}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
