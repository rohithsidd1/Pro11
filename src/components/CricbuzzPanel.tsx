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
  ['list', 'Match list', 'matches'], ['schedule', 'Schedules', 'matches'], ['info', 'Squads, toss and Playing XI', 'items'],
  ['scorecard', 'Live scorecards and points', 'items'], ['roles', 'Player roles', 'players'],
]
const REPORT = `${window.location.origin}/.netlify/functions/cricbuzz?debug=1`

/** Admin: which data source Pro11 uses, and how the Cricbuzz reader is doing. */
export function CricbuzzPanel() {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const s = (settings ?? {}) as unknown as { cb_health?: Health; last_cb_list_at?: string; last_cb_schedule_at?: string }
  const health = s.cb_health ?? {}
  const [busy, setBusy] = useState<string | null>(null)
  const timing = useSettingsForm<{ cb_list_minutes: number; cb_live_minutes: number; cb_schedule_hours: number }>(['cb_list_minutes', 'cb_live_minutes', 'cb_schedule_hours'])

  const syncNow = async () => {
    setBusy('sync')
    try {
      const r = await callFunction<{ result: { message?: string } }>('sync-cricket', { mode: 'sync-now' })
      toast(r.result.message ?? 'Synced'); await refresh()
    } catch (e) { toast(e instanceof Error ? e.message : 'Sync failed') } finally { setBusy(null) }
  }
  const allOk = PARTS.every(([k]) => !health[k] || health[k].ok)
  void timing; void supabase; void errorText

  return (
    <section className="panel">
      <div className="ch"><h3>Cricbuzz</h3>{Object.keys(health).length ? <span className={allOk ? 'tag ok' : 'tag bad'}><span className="tx">{allOk ? 'Working' : 'Needs attention'}</span></span> : null}</div>
      <p className="help">Pro11 reads Cricbuzz by itself: live joined matches every minute, everything else every 5 minutes. Squads, roles and the Playing XI come straight from Cricbuzz.</p>
      <button className="btn primary" style={{ marginTop: 12 }} disabled={!!busy} onClick={syncNow}>{busy ? <span className="spinner" /> : <Icon name="refresh" small />}<span>Sync now</span></button>
      <p className="help" style={{ marginTop: 6 }}>Last update: {s.last_cb_list_at ? `${istDayName(s.last_cb_list_at)} ${istTime(s.last_cb_list_at)}` : 'not yet'}</p>
      <div className="tscroll" style={{ marginTop: 12 }}>
        <table className="wtable">
          <thead><tr><th scope="col">Part</th><th scope="col">Last run</th><th scope="col" className="r">Found</th><th scope="col">Health</th></tr></thead>
          <tbody>{PARTS.filter(([k]) => k !== 'roles' || health.roles).map(([k, label, unit]) => {
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
    </section>
  )
}
