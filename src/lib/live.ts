import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Live updates. The database announces every change to these tables (Supabase Realtime); screens that show
 * them reload straight away instead of waiting for their timer. Bursts are bundled into one reload.
 */
export const LIVE_TABLES = ['matches', 'contests', 'entries', 'xi_picks', 'fantasy_picks', 'match_players', 'player_points',
  'ledger_lines', 'settlements', 'notifications'] as const
export type LiveTable = (typeof LIVE_TABLES)[number]

let channel: RealtimeChannel | null = null
let pending = new Set<LiveTable>()
let timer: number | undefined

function announce(tables: Iterable<LiveTable>) {
  for (const t of tables) pending.add(t)
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    const detail = { tables: [...pending] }
    pending = new Set()
    window.dispatchEvent(new CustomEvent('pro11:changed', { detail }))
  }, 600)
}

export function startLiveUpdates() {
  if (channel) return
  let ch = supabase.channel('pro11-live')
  for (const table of LIVE_TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => announce([table]))
  // after a reconnect we may have missed changes: refresh everything once
  let first = true
  channel = ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { if (!first) announce(LIVE_TABLES); first = false }
  })
  document.addEventListener('visibilitychange', onVisible)
}

export function stopLiveUpdates() {
  document.removeEventListener('visibilitychange', onVisible)
  if (channel) void supabase.removeChannel(channel)
  channel = null
}

// coming back to the tab: catch up on anything that changed while it was in the background
let hiddenAt = 0
function onVisible() {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
  if (hiddenAt && Date.now() - hiddenAt > 5000) announce(LIVE_TABLES)
}

/** Reload when any of these tables change. */
export function useLiveReload(tables: readonly LiveTable[], reload: () => unknown) {
  const ref = useRef(reload)
  ref.current = reload
  const key = tables.join(',')
  useEffect(() => {
    const want = key.split(',')
    const on = (e: Event) => { if ((e as CustomEvent<{ tables: string[] }>).detail.tables.some((t) => want.includes(t))) void ref.current() }
    window.addEventListener('pro11:changed', on)
    return () => window.removeEventListener('pro11:changed', on)
  }, [key])
}

/** The current time, ticking every `ms`, so countdowns and "live" labels stay right without a reload. */
export function useNow(ms = 30000) {
  const [, force] = useRefreshState()
  useEffect(() => { const t = window.setInterval(force, ms); return () => window.clearInterval(t) }, [ms, force])
  return Date.now()
}
function useRefreshState(): [number, () => void] {
  const [n, set] = useState(0)
  return [n, useCallback(() => set((x) => x + 1), [])]
}

/** A number that goes up whenever one of these tables changes (for effects that should re-run). */
export function useLiveVersion(tables: readonly LiveTable[]) {
  const [v, setV] = useState(0)
  useLiveReload(tables, () => setV((x) => x + 1))
  return v
}
