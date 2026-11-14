import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Admin-uploaded team logos, loaded once and shared by every badge. */
let cache: Promise<Map<string, string>> | null = null
let listeners: ((m: Map<string, string>) => void)[] = []
let current = new Map<string, string>()

function load() {
  cache = Promise.resolve(supabase.from('teams').select('key, custom_img').not('custom_img', 'is', null))
    .then(({ data }) => new Map(((data ?? []) as { key: string; custom_img: string }[]).map((t) => [t.key, t.custom_img])))
    .then((m) => { current = m; listeners.forEach((l) => l(m)); return m })
    .catch(() => current)
  return cache
}
export function clearTeamCache() { void load() }

export function useCustomBadges(): Map<string, string> {
  const [m, setM] = useState(current)
  useEffect(() => {
    listeners.push(setM)
    if (!cache) void load()
    return () => { listeners = listeners.filter((l) => l !== setM) }
  }, [])
  return m
}
