import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { ApiCall, ApiUsage, DataSettings } from './types'

const todayUtc = () => new Date().toISOString().slice(0, 10)

/** Cricket data settings, today's API usage and the latest calls (admin only). */
export function useDataStatus() {
  const [settings, setSettings] = useState<DataSettings | null>(null)
  const [usage, setUsage] = useState<ApiUsage | null>(null)
  const [calls, setCalls] = useState<ApiCall[]>([])
  const load = useCallback(async () => {
    const [s, u, c] = await Promise.all([
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('api_usage').select('*').eq('day', todayUtc()).maybeSingle(),
      supabase.from('api_calls').select('*').order('at', { ascending: false }).limit(40),
    ])
    setSettings(s.data as DataSettings | null)
    setUsage(u.data as ApiUsage | null)
    setCalls((c.data as ApiCall[] | null) ?? [])
  }, [])
  useEffect(() => { void load() }, [load])
  const used = Math.max(usage?.credits ?? 0, usage?.hits_today ?? 0)
  return { settings, usage, calls, used, reload: load }
}
