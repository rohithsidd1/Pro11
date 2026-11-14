import { useEffect, useState } from 'react'
import { errorText } from './api'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { useToast } from './toast'

/** Edit a few app_settings columns directly (the admin may update settings; row-level security enforces it). */
export function useSettingsForm<T extends Record<string, unknown>>(keys: (keyof T)[]) {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const [f, setF] = useState<T | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!settings) return
    const s = settings as unknown as Record<string, unknown>
    setF(Object.fromEntries(keys.map((k) => [k, s[k as string]])) as T)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])
  const set = <K extends keyof T>(k: K, v: T[K]) => setF((x) => (x ? { ...x, [k]: v } : x))
  const save = async (extra?: Partial<T>) => {
    if (!f) return false
    setBusy(true)
    const patch = { ...f, ...extra } as Record<string, unknown>
    const { error } = await supabase.from('app_settings').update(patch as never).eq('id', 1)
    setBusy(false)
    if (error) { toast(errorText(error)); return false }
    await refresh(); toast('Saved'); return true
  }
  return { f, set, save, busy }
}
