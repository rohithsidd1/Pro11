import { useState } from 'react'
import { callFunction, errorText } from '../lib/api'
import { useAuth } from '../lib/auth'
import { istDayName, istTime } from '../lib/ist'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useSettingsForm } from '../lib/useSettingsForm'
import { Icon } from './Icon'

type Health = Record<string, { at: string; ok: boolean; found: number; ms: number; error?: string; fails?: number }>
const PARTS: [string, string, string][] = [
  ['list', 'Match list', 'matches'], ['schedule', 'Schedules', 'matches'], ['info', 'Match pages (time, toss, squads, XI)', 'items'],
  ['scorecard', 'Live scorecards and points', 'items'], ['roles', 'Player roles', 'players'],
]
const REPORT = `${window.location.origin}/.netlify/functions/cricbuzz?debug=1`

/** Admin: which data source Pro11 uses, and how the Cricbuzz reader is doing. */
export function CricbuzzPanel() {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const s = (settings ?? {}) as unknown as { data_source?: string; cb_health?: Health; last_cb_list_at?: string; last_cb_schedule_at?: string }
  const source = s.data_source ?? 'cricbuzz'
  const health = s.cb_health ?? {}
  const [busy, setBusy] = useState<string | null>(null)
  const timing = useSettingsForm<{ cb_list_minutes: number; cb_live_minutes: number; cb_schedule_hours: number }>(['cb_list_minutes', 'cb_live_minutes', 'cb_schedule_hours'])

  const switchTo = async (to: 'cricbuzz' | 'cricketdata') => {
    if (to === source) return
    if (!window.confirm(to === 'cricbuzz' ? 'Use Cricbuzz (free, unofficial) for matches, squads, Playing XI, live scores and points?' : 'Use CricketData (official API, daily credit limit)?')) return
    const { error } = await supabase.from('app_settings').update({ data_source: to } as never).eq('id', 1)
    if (error) return toast(errorText(error))
    await refresh(); toast(to === 'cricbuzz' ? 'Using Cricbuzz' : 'Using CricketData')
  }
  const run = async (mode: 'list' | 'fixtures') => {
    setBusy(mode)
    try {
      const r = await callFunction<{ result: { saved?: number; found?: number; error?: string } }>('sync-cricket', { mode })
      toast(r.result.error ? r.result.error : `${r.result.found ?? 0} found, ${r.result.saved ?? 0} saved`)
      await refresh()
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed') } finally { setBusy(null) }
  }
  const N = ({ k, label, sub, min, max, unit }: { k: 'cb_list_minutes' | 'cb_live_minutes' | 'cb_schedule_hours'; label: string; sub: string; min: number; max: number; unit: string }) => timing.f && (
    <div className="rule"><div><p className="k">{label}</p><p className="s">{sub}</p></div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input className="num-in" type="number" min={min} max={max} value={timing.f[k]} aria-label={label} onChange={(e) => timing.set(k, Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || min))))} />
        <span className="help">{unit}</span></span></div>
  )

  return (
    <section className="panel">
      <div className="ch"><h3>Data source</h3></div>
      <div className="seg sm" role="group" aria-label="Data source">
        <button aria-pressed={source === 'cricbuzz'} onClick={() => switchTo('cricbuzz')}>Cricbuzz (free)</button>
        <button aria-pressed={source === 'cricketdata'} onClick={() => switchTo('cricketdata')}>CricketData (credits)</button>
      </div>
      {source === 'cricbuzz' ? (
        <>
          <p className="help" style={{ marginTop: 10 }}>Read from Cricbuzz’s public pages: every league, squads with roles, the Playing XI at the toss, live scorecards. Pro11 works out fantasy points itself (Game rules → Fantasy points). Unofficial: if Cricbuzz changes its site, a part below turns red; send Claude the health report.</p>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={!!busy} onClick={() => run('list')}>{busy === 'list' ? <span className="spinner" /> : <Icon name="refresh" small />}<span>Refresh match list</span></button>
            <button className="btn sm" disabled={!!busy} onClick={() => run('fixtures')}>{busy === 'fixtures' ? <span className="spinner" /> : <Icon name="down" small />}<span>Load schedules</span></button>
          </div>
          <div className="tscroll" style={{ marginTop: 12 }}>
            <table className="wtable">
              <thead><tr><th scope="col">Part</th><th scope="col">Last run</th><th scope="col" className="r">Found</th><th scope="col">Health</th></tr></thead>
              <tbody>{PARTS.map(([k, label, unit]) => {
                const h = health[k]
                return (
                  <tr key={k}><td>{label}</td>
                    <td className="num">{h ? `${istDayName(h.at)} ${istTime(h.at)}` : 'not yet'}</td>
                    <td className="r num">{h ? `${h.found} ${unit}` : '–'}</td>
                    <td>{!h ? <span className="help">waiting</span> : h.ok ? <span className="tag ok"><span className="tx">Working</span></span>
                      : <span className="tag bad" title={h.error}><span className="tx">{h.error ? 'Problem' : 'Found nothing'}{h.fails && h.fails > 1 ? ` ×${h.fails}` : ''}</span></span>}</td></tr>
                )
              })}</tbody>
            </table>
          </div>
          <a className="btn sm" style={{ marginTop: 12 }} href={REPORT} target="_blank" rel="noreferrer"><Icon name="log" small /><span>Open health report</span></a>
          {timing.f && (
            <div style={{ marginTop: 14 }}>
              <N k="cb_list_minutes" label="Refresh the match list every" sub="Live, recent and upcoming matches" min={10} max={360} unit="min" />
              <N k="cb_live_minutes" label="Live updates every" sub="Joined matches: toss, Playing XI, score, points" min={3} max={60} unit="min" />
              <N k="cb_schedule_hours" label="Load schedules every" sub="Tomorrow’s and later matches" min={1} max={72} unit="hrs" />
              <button className="btn sm primary" style={{ marginTop: 8 }} disabled={timing.busy} onClick={() => timing.save()}>{timing.busy ? <span className="spinner" /> : <span>Save timing</span>}</button>
            </div>
          )}
        </>
      ) : <p className="help" style={{ marginTop: 10 }}>CricketData’s official API, limited by daily credits. Settings for it are below.</p>}
    </section>
  )
}
