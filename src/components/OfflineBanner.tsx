import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/** Shows when the phone is offline, or when the server can't be reached (with a way to try again). */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [failing, setFailing] = useState(false)
  const lastFail = useRef(0)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    // show at the first failure; clear only after 10 s without one, so it doesn't flicker
    const net = (e: Event) => {
      if (!(e as CustomEvent<{ ok: boolean }>).detail.ok) { lastFail.current = Date.now(); setFailing(true) }
      else if (Date.now() - lastFail.current > 10000) setFailing(false)
    }
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('pro11:net', net)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('pro11:net', net) }
  }, [])
  if (!online) return <div className="offline" role="status"><Icon name="alert" small />You’re offline. Showing what was last loaded; nothing can be saved until you’re back.</div>
  if (!failing) return null
  return (
    <div className="offline" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Icon name="alert" small /><span style={{ flex: 1 }}>Couldn’t reach Pro11. Check your connection.</span>
      <button className="btn sm" onClick={() => window.location.reload()}><span>Try again</span></button>
    </div>
  )
}
