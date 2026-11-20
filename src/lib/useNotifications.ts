import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { useLiveReload } from './live'

export interface Notice { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

/** Your notifications, newest first, refreshed every minute while the app is open. */
export function useNotifications(limit = 60) {
  const { profile } = useAuth()
  const [items, setItems] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(limit)
    setItems((data as Notice[] | null) ?? []); setLoading(false)
  }, [profile, limit])
  useLiveReload(['notifications'], load)
  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const t = window.setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [load])
  const unread = items.filter((n) => !n.read_at).length
  const markRead = async (ids: string[]) => {
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
    await supabase.from('notifications').update({ read_at: now }).in('id', ids)
  }
  return { items, unread, loading, reload: load, markRead }
}
