import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { UPI_RE } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MoneySettings as MS } from '../../lib/types'

export function MoneySettings() {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const [f, setF] = useState<MS | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (settings) setF(settings as unknown as MS) }, [settings])
  if (!f) return <Shell title="Money settings" back="/admin"><p className="help">Loading…</p></Shell>
  const set = <K extends keyof MS>(k: K, v: MS[K]) => setF({ ...f, [k]: v })

  const save = async () => {
    setError(null)
    if (!UPI_RE.test(f.upi_id.trim())) return setError('That doesn’t look like a UPI ID, for example 7799292381@ybl.')
    if (f.min_topup > f.max_topup) return setError('The smallest top-up can’t be more than the largest.')
    setBusy(true)
    const { error: err } = await supabase.rpc('admin_update_money_settings', {
      p_upi_id: f.upi_id.trim(), p_payee_name: f.payee_name.trim(), p_min_topup: f.min_topup, p_max_topup: f.max_topup,
      p_min_withdrawal: f.min_withdrawal, p_accept_phonepe: f.accept_phonepe, p_accept_gpay: f.accept_gpay,
      p_accept_paytm: f.accept_paytm, p_accept_other_upi: f.accept_other_upi,
    })
    setBusy(false)
    if (err) return setError(errorText(err))
    await refresh(); toast('Saved')
  }

  const Num = ({ k, label }: { k: 'min_topup' | 'max_topup' | 'min_withdrawal'; label: string }) => (
    <div className="rule"><p className="k">{label}</p>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="help num">₹</span>
        <input className="num-in" type="number" min={1} value={f[k]} aria-label={label} onChange={(e) => set(k, Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
      </span>
    </div>
  )
  const Tog = ({ k, label }: { k: 'accept_phonepe' | 'accept_gpay' | 'accept_paytm' | 'accept_other_upi'; label: string }) => (
    <label className="rule" style={{ cursor: 'pointer' }}><p className="k">{label}</p>
      <input type="checkbox" role="switch" className="switch" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
    </label>
  )

  return (
    <Shell title="Money settings" back="/admin">
      <div className="cols-2">
        <section className="panel">
          <div className="ch"><h3>Where members pay</h3></div>
          <div className="field"><label htmlFor="upi">Your UPI ID</label><div className="input"><input id="upi" className="num" value={f.upi_id} onChange={(e) => set('upi_id', e.target.value)} autoCapitalize="none" /></div></div>
          <div className="field"><label htmlFor="payee">Name payers see</label><div className="input"><input id="payee" value={f.payee_name} onChange={(e) => set('payee_name', e.target.value)} /></div>
            <p className="help">Screenshots are checked for this name or the UPI ID.</p></div>
        </section>
        <section className="panel">
          <div className="ch"><h3>Limits</h3></div>
          <Num k="min_topup" label="Smallest top-up" />
          <Num k="max_topup" label="Largest top-up" />
          <Num k="min_withdrawal" label="Smallest withdrawal" />
          <div className="ch" style={{ marginTop: 18 }}><h3>Accepted apps</h3></div>
          <Tog k="accept_phonepe" label="PhonePe" />
          <Tog k="accept_gpay" label="GPay" />
          <Tog k="accept_paytm" label="Paytm" />
          <Tog k="accept_other_upi" label="Other UPI apps" />
        </section>
      </div>
      {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
      <button className="btn primary" style={{ marginTop: 20, minWidth: 220 }} disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <span>Save changes</span>}</button>
    </Shell>
  )
}
