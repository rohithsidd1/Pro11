import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { OtpInput } from '../../components/OtpInput'
import { WelcomeArt } from '../../components/WelcomeArt'
import { callFunction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatPhone } from '../../lib/phone'
import { mmss } from '../../lib/time'
import { useToast } from '../../lib/toast'
import type { PendingSignIn } from '../../lib/types'
import { PENDING_KEY } from './SignIn'

function readPending(): PendingSignIn | null {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as PendingSignIn | null } catch { return null }
}

export function EnterCode() {
  const navigate = useNavigate()
  const toast = useToast()
  const { completeSignIn } = useAuth()
  const [pending, setPending] = useState<PendingSignIn | null>(readPending)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])

  if (!pending) return <Navigate to="/sign-in" replace />
  const left = (new Date(pending.expiresAt).getTime() - now) / 1000
  const expired = left <= 0

  const verify = async (e?: FormEvent) => {
    e?.preventDefault()
    if (code.length !== pending.codeLength || busy) return
    setBusy(true); setError(null)
    try {
      const res = await callFunction<{ tokenHash: string; sessionEpoch: number }>('verify-code', { phone: pending.phone, code })
      await completeSignIn(res.tokenHash, res.sessionEpoch)
      sessionStorage.removeItem(PENDING_KEY)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t check the code. Try again.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    try {
      const res = await callFunction<{ expiresAt: string; codeLength: number; adminName: string; forAdmin: boolean; sessionDays: number }>(
        'request-code', { name: pending.name, phone: pending.phone })
      const next = { ...pending, ...res }
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(next))
      setPending(next); setCode('')
      toast(`New code sent to ${res.adminName.split(' ')[0]}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t get a new code.')
    }
  }

  const adminFirst = pending.adminName.split(' ')[0]

  return (
    <div className="auth">
      <div className="auth-art wide-only"><WelcomeArt /></div>
      <form className="auth-form" onSubmit={verify}>
        <div className="inner">
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => navigate('/sign-in')} style={{ marginTop: 8 }}>
            <Icon name="back" />
          </button>
          <h1 className="h1" style={{ marginTop: 20 }}>Enter your code</h1>
          {pending.forAdmin ? (
            <p className="lead">
              You’re the admin. Your code is in <b>Sign-in codes</b> on any device where you’re signed in. First time? Open Supabase → Table
              editor → <b>otp_requests</b> and copy the newest code.
            </p>
          ) : (
            <p className="lead">
              {adminFirst} has a {pending.codeLength}-digit code for <span className="num">{formatPhone(pending.phone)}</span>. Ask him for it on WhatsApp.
            </p>
          )}
          <div style={{ marginTop: 28 }}>
            <OtpInput length={pending.codeLength} value={code} onChange={(v) => { setCode(v); setError(null) }} disabled={busy} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <span className="help" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" small />
              <span>{expired ? 'Code expired' : <>Expires in <span className="num">{mmss(left)}</span></>}</span>
            </span>
            <button type="button" className="textlink" onClick={resend}>Get a new code</button>
          </div>
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <p className="help" style={{ marginTop: 16 }}>You stay signed in on this device for <span className="num">{pending.sessionDays ?? 30}</span> days.</p>
          <div className="grow" />
          <button className="btn primary block" disabled={code.length !== pending.codeLength || busy || expired} style={{ marginTop: 24 }}>
            {busy ? <span className="spinner" aria-label="Checking" /> : <span>Verify</span>}
          </button>
        </div>
      </form>
    </div>
  )
}
