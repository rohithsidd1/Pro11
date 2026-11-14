import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { WelcomeArt } from '../../components/WelcomeArt'
import { callFunction } from '../../lib/api'
import { normalizePhone, typePhone } from '../../lib/phone'
import type { PendingSignIn } from '../../lib/types'

export const PENDING_KEY = 'pro11.pending'

export function SignIn() {
  const navigate = useNavigate()
  const [name, setName] = useState(localStorage.getItem('pro11.lastName') ?? '')
  const [phone, setPhone] = useState(typePhone(localStorage.getItem('pro11.lastPhone') ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = name.trim().replace(/\s+/g, ' ')
    const p = normalizePhone(phone)
    if (n.length < 2) return setError('Enter your name.')
    if (!p) return setError('Enter a 10-digit mobile number.')
    setBusy(true)
    try {
      const res = await callFunction<{ expiresAt: string; codeLength: number; adminName: string; forAdmin: boolean; sessionDays: number }>(
        'request-code', { name: n, phone: p })
      const pending: PendingSignIn = { name: n, phone: p, ...res }
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
      localStorage.setItem('pro11.lastName', n)
      localStorage.setItem('pro11.lastPhone', p.slice(3))
      navigate('/sign-in/code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t ask for a code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-art wide-only"><WelcomeArt /></div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="inner">
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => navigate('/welcome')} style={{ marginTop: 8 }}>
            <Icon name="back" />
          </button>
          <h1 className="h1" style={{ marginTop: 20 }}>Sign in</h1>
          <p className="lead">Your code goes to the admin. Ask him for it on WhatsApp.</p>
          <div style={{ marginTop: 24 }}>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <div className="input"><input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} /></div>
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <div className="input">
                <span className="pre num">+91</span>
                <input id="phone" className="num" value={phone} onChange={(e) => setPhone(typePhone(e.target.value))}
                  inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" />
              </div>
            </div>
          </div>
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <div className="grow" />
          <button className="btn primary block" disabled={busy} style={{ marginTop: 24 }}>
            {busy ? <span className="spinner" aria-label="Asking for a code" /> : <span>Request code</span>}
          </button>
        </div>
      </form>
    </div>
  )
}
