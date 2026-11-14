import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { enablePush, markPushAsked, needsInstallForPush } from '../lib/push'
import { useToast } from '../lib/toast'

/** "Stay in the loop": asks once after sign-in. */
export function AlertsSetup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const iosInstall = needsInstallForPush()
  const allow = async () => {
    if (!profile) return
    setBusy(true)
    try {
      const r = await enablePush(profile.id)
      if (r === 'install') return navigate('/install')
      toast(r === 'on' ? 'Alerts are on' : r === 'denied' ? 'Alerts are off. You can turn them on later from Me.' : 'This browser can’t show alerts')
      navigate('/', { replace: true })
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t turn alerts on') } finally { setBusy(false) }
  }
  const later = () => { markPushAsked(); navigate('/', { replace: true }) }
  return (
    <main className="screen center-screen">
      <div className="onboard">
        <span className="onboard-ic"><Icon name="bell" /></span>
        <h1 className="h1">Stay in the loop</h1>
        <p className="lead">We’ll tell you when the Playing XI is out, when a game is about to lock, and when payments clear.</p>
        <div className="panel preview-note">
          <span className="ic" style={{ ['--b' as string]: 'var(--mint)' }}><Icon name="stumps" /></span>
          <span><span className="rt">Playing XI is out for IND vs SA</span><span className="rs">Check your Fantasy XI before 17:00.</span></span>
        </div>
        {iosInstall && <p className="help" style={{ marginTop: 12 }}>On iPhone, alerts work once Pro11 is on your Home Screen. <Link to="/install" className="textlink" style={{ minHeight: 0 }}>How to add it</Link></p>}
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn" onClick={later}><span>Not now</span></button>
          <button className="btn primary" disabled={busy} onClick={allow}>{busy ? <span className="spinner" /> : <span>{iosInstall ? 'Add to Home Screen' : 'Allow'}</span>}</button>
        </div>
      </div>
    </main>
  )
}
