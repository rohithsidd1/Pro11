import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { disablePush, enablePush, pushIsOn, pushSupported, needsInstallForPush } from '../lib/push'
import { useToast } from '../lib/toast'
import { Icon } from './Icon'

/** Phone alerts on/off for this device. */
export function AlertsToggle() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void pushIsOn().then(setOn) }, [])
  const flip = async () => {
    if (!profile) return
    setBusy(true)
    try {
      if (on) { await disablePush(); setOn(false); toast('Alerts are off on this phone') }
      else {
        const r = await enablePush(profile.id)
        if (r === 'install') return navigate('/install')
        setOn(r === 'on')
        toast(r === 'on' ? 'Alerts are on' : r === 'denied' ? 'Blocked in the browser settings. Allow notifications for this site, then try again.' : 'This browser can’t show alerts')
      }
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t change alerts') } finally { setBusy(false) }
  }
  const sub = !pushSupported() && !needsInstallForPush() ? 'Not available in this browser' : needsInstallForPush() ? 'Add Pro11 to your Home Screen first' : on ? 'On for this phone' : 'Off for this phone'
  return (
    <label className="row" style={{ cursor: 'pointer' }}>
      <span className="ic" style={{ ['--b' as string]: 'var(--lemon)' }}><Icon name="bell" /></span>
      <span><span className="rt">Phone alerts</span><span className="rs">{sub}</span></span>
      <input type="checkbox" role="switch" className="switch" checked={on} disabled={busy} onChange={flip} aria-label="Phone alerts" />
    </label>
  )
}
