import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Number of sign-in codes waiting for the admin. Polls while the tab is visible. */
export function usePendingCodeCount(enabled: boolean, everyMs = 10000): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      const { count: c } = await supabase.from('otp_requests').select('id', { count: 'exact', head: true })
        .eq('status', 'pending').gt('expires_at', new Date().toISOString())
      if (alive) setCount(c ?? 0)
    }
    void tick()
    const t = window.setInterval(tick, everyMs)
    document.addEventListener('visibilitychange', tick)
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [enabled, everyMs])
  return count
}
