import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { OtpRequest } from './types'

/** Sign-in code requests from the last 24 hours, refreshed every few seconds while visible. */
export function useCodes(everyMs = 4000) {
  const [rows, setRows] = useState<OtpRequest[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 864e5).toISOString()
    const { data } = await supabase.from('otp_requests').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(60)
    setRows((data as OtpRequest[] | null) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const t = window.setInterval(tick, everyMs)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [load, everyMs])
  const now = Date.now()
  const waiting = rows.filter((r) => r.status === 'pending' && new Date(r.expires_at).getTime() > now)
  const notMembers = rows.filter((r) => r.status === 'blocked')
  const earlier = rows.filter((r) => !waiting.includes(r) && r.status !== 'blocked')
  return { rows, waiting, notMembers, earlier, loading, reload: load }
}
