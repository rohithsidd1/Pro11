import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { rupees, UPI_RE } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import type { MoneySettings } from '../../lib/types'
import { useWallet } from '../../lib/useWallet'

export function Withdraw() {
  const { profile, settings } = useAuth()
  const s = settings as unknown as MoneySettings
  const { balance, loading } = useWallet()
  const navigate = useNavigate()
  const [amountText, setAmountText] = useState('')
  const [upi, setUpi] = useState(profile?.upi_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const amount = Math.floor(Number(amountText) || 0)
  const first = s.admin_name.split(' ')[0]
  const tooLittle = balance < s.min_withdrawal
  const quick = [50, 100, 200].filter((v) => v >= s.min_withdrawal && v < balance)

  const submit = async () => {
    setError(null)
    if (amount < s.min_withdrawal) return setError(`The smallest withdrawal is ${rupees(s.min_withdrawal)}.`)
    if (amount > balance) return setError(`You can withdraw up to ${rupees(balance)}.`)
    if (!UPI_RE.test(upi.trim())) return setError('Enter your UPI ID, for example name@okaxis.')
    setBusy(true)
    const { data, error: err } = await supabase.rpc('request_withdrawal', { p_amount: amount, p_upi: upi.trim() })
    setBusy(false)
    if (err) return setError(errorText(err))
    navigate(`/wallet/withdrawal/${data as string}?sent=1`, { replace: true })
  }

  return (
    <Shell title="Withdraw" back="/wallet">
      <div className="split-2">
        <section className="panel">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="wamt">Amount</label>
            <div className="input big"><span className="pre">₹</span>
              <input id="wamt" inputMode="numeric" value={amountText} placeholder="0" onChange={(e) => setAmountText(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </div>
          </div>
          <div className="chips-q" role="group" aria-label="Quick amounts" style={{ marginTop: 12 }}>
            {quick.map((v) => <button key={v} type="button" className="qchip" aria-pressed={amount === v} onClick={() => setAmountText(String(v))}>{rupees(v)}</button>)}
            {balance >= s.min_withdrawal && <button type="button" className="qchip" aria-pressed={amount === balance} onClick={() => setAmountText(String(balance))}>All {rupees(balance)}</button>}
          </div>
          <p className="help" style={{ marginTop: 10 }}>
            {loading ? 'Checking your balance…' : tooLittle ? `You need at least ${rupees(s.min_withdrawal)} to withdraw. You have ${rupees(balance)}.` : `You can withdraw up to ${rupees(balance)}.`}
          </p>
          <div className="field" style={{ marginTop: 22 }}>
            <label htmlFor="wupi">Send to UPI ID</label>
            <div className="input"><input id="wupi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" autoComplete="off" autoCapitalize="none" /></div>
          </div>
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <button className="btn primary block" style={{ marginTop: 22 }} disabled={busy || tooLittle || amount <= 0} onClick={submit}>
            {busy ? <span className="spinner" aria-label="Sending" /> : <span>Request <span className="num">{rupees(amount)}</span></span>}
          </button>
        </section>
        <div style={{ display: 'grid', gap: 8 }}>
          <section className="panel" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="read"><span className="k">Available</span><span className="v">{rupees(balance)}</span></div>
            <div className="read"><span className="k">Withdrawing</span><span className="v">{rupees(Math.min(amount, balance))}</span></div>
            <div className="read"><span className="k">Left after</span><span className="v">{rupees(Math.max(0, balance - amount))}</span></div>
          </section>
          <div className="panel" style={{ background: 'var(--soft)', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10 }}>
            <Icon name="info" small />
            <p className="help" style={{ color: 'var(--ink)' }}>The amount leaves your balance now, so it can’t be spent twice. {first} pays you on UPI and you get a notification. If it’s cancelled or rejected, it comes straight back.</p>
          </div>
        </div>
      </div>
    </Shell>
  )
}
