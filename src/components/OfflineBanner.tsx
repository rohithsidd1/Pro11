import { useEffect, useState } from 'react'
import { Icon } from './Icon'

/** Shows when the phone loses its connection. */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return <div className="offline" role="status"><Icon name="alert" small />You’re offline. Showing what was last loaded; nothing can be saved until you’re back.</div>
}
