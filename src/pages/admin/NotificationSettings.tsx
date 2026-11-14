import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { useSettingsForm } from '../../lib/useSettingsForm'

type N = { n_squads_out: boolean; n_xi_out: boolean; n_lock_soon: boolean; n_lock_minutes: number; n_money: boolean; n_results: boolean; n_withdrawal: boolean }

export function NotificationSettings() {
  const toast = useToast()
  const { f, set, save, busy } = useSettingsForm<N>(['n_squads_out', 'n_xi_out', 'n_lock_soon', 'n_lock_minutes', 'n_money', 'n_results', 'n_withdrawal'])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  if (!f) return <Shell title="Notifications" back="/admin"><p className="help">Loading…</p></Shell>
  const Sw = ({ k, label, sub }: { k: keyof N; label: string; sub?: string }) => (
    <label className="rule" style={{ cursor: 'pointer' }}><div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <input type="checkbox" role="switch" className="switch" checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked as never)} /></label>
  )
  const send = async () => {
    setSending(true)
    const { data, error } = await supabase.rpc('admin_broadcast', { p_title: title, p_body: body })
    setSending(false)
    if (error) return toast(errorText(error))
    setTitle(''); setBody(''); toast(`Sent to ${data as number} people`)
  }
  return (
    <Shell title="Notifications" back="/admin" kicker="What members are told">
      <div className="cols-2">
        <section className="panel">
          <div className="ch"><h3>Send to members</h3></div>
          <Sw k="n_squads_out" label="Squads are out, games are open" sub="One alert per refresh, listing the new matches" />
          <Sw k="n_xi_out" label="Playing XI is out" />
          <Sw k="n_lock_soon" label="Game locks soon" sub="To people in the game" />
          <div className="rule"><p className="k">Remind before the lock</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input className="num-in" type="number" min={5} max={120} value={f.n_lock_minutes} aria-label="Minutes before the lock" onChange={(e) => set('n_lock_minutes', Math.max(5, Math.min(120, Math.floor(Number(e.target.value) || 15))))} />
              <span className="help">min</span></span>
          </div>
          <Sw k="n_money" label="Payment approved or rejected" sub="Also wallet changes by the admin" />
          <Sw k="n_results" label="Results and payouts" sub="Also cancelled games and refunds" />
          <Sw k="n_withdrawal" label="Withdrawal paid or rejected" />
          <p className="help" style={{ marginTop: 10 }}>Alerts appear in the app’s bell, and on phones that turned alerts on. Money waiting for you (payments, withdrawals) and problems (sync failures, credits at 80%, automatic refunds, removed leagues, payouts) always reach you.</p>
          <button className="btn primary" style={{ marginTop: 14 }} disabled={busy} onClick={() => save()}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Save</span></>}</button>
        </section>
        <section className="panel">
          <div className="ch"><h3>Message everyone</h3></div>
          <div className="field"><label htmlFor="bt">Message</label><div className="input"><input id="bt" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="No games tomorrow" /></div></div>
          <div className="field"><label htmlFor="bb">More detail <span className="help">(optional)</span></label><textarea id="bb" className="area" value={body} maxLength={400} onChange={(e) => setBody(e.target.value)} placeholder="Back on Saturday for the 4th T20I!" /></div>
          <button className="btn primary" disabled={sending || !title.trim()} onClick={send}>{sending ? <span className="spinner" /> : <><Icon name="send" /><span>Send to everyone</span></>}</button>
        </section>
      </div>
    </Shell>
  )
}
