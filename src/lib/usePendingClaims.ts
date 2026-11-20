import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

/** Payments others recorded to me that I still need to confirm (badge on Ledger). */
export function usePendingClaims(everyMs = 30000) {
  const { profile } = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!profile) return
    const load = () => supabase.from('settlements').select('id', { count: 'exact', head: true }).eq('to_user', profile.id).eq('status', 'pending')
      .then(({ count }) => setN(count ?? 0))
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, everyMs)
    return () => window.clearInterval(t)
  }, [profile, everyMs])
  return n
}
