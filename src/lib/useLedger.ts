import { useCallback, useEffect, useState } from 'react'
import { errorText } from './api'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { useLiveReload } from './live'

export interface Balance { user_id: string; name: string; color: string; upi_id: string | null; net: number; waiting_out: number; waiting_in: number; games: number }
export interface Claim { id: string; from_user: string; to_user: string; amount: number; note: string | null; status: string; created_at: string; who?: { name: string; color: string } }
export interface LedgerRow { at: string; kind: 'game' | 'payment'; title: string; detail: string | null; amount: number; status: string; link: string | null; settlement_id: string | null }

/** ₹5, ₹12.50, with a sign when asked. */
export const money = (v: number, sign = false) => {
  const a = Math.abs(Number(v) || 0)
  const t = Number.isInteger(Math.round(a * 100) / 100) ? String(Math.round(a)) : a.toFixed(2)
  return `${sign && v < 0 ? '−' : sign && v > 0 ? '+' : ''}₹${Number(t).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: t.includes('.') ? 2 : 0 })}`
}

/** My balances with everyone, payments waiting for my confirmation, and the totals. Refreshes every 30 s. */
export function useLedger() {
  const { profile } = useAuth()
  const [balances, setBalances] = useState<Balance[] | null>(null)
  const [incoming, setIncoming] = useState<Claim[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!profile) return
    const [b, c] = await Promise.all([
      supabase.rpc('my_balances'),
      supabase.from('settlements').select('*, who:profiles!settlements_from_user_fkey(name, color)').eq('to_user', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    if (b.error) { setError(errorText(b.error)); return }
    setBalances(((b.data ?? []) as Balance[]).map((x) => ({ ...x, net: Number(x.net), waiting_out: Number(x.waiting_out), waiting_in: Number(x.waiting_in) })))
    setIncoming(((c.data ?? []) as Claim[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setError(null)
  }, [profile])
  useLiveReload(['ledger_lines', 'settlements'], load)
  useEffect(() => {
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    return () => window.clearInterval(t)
  }, [load])
  const owedToMe = (balances ?? []).filter((b) => b.net > 0).reduce((n, b) => n + b.net, 0)
  const iOwe = (balances ?? []).filter((b) => b.net < 0).reduce((n, b) => n - b.net, 0)
  return { balances, incoming, error, reload: load, owedToMe, iOwe, total: owedToMe - iOwe }
}

export function useLedgerWith(otherId: string) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('ledger_with', { p_other: otherId })
    setRows(((data ?? []) as LedgerRow[]).map((r) => ({ ...r, amount: Number(r.amount) })))
  }, [otherId])
  useLiveReload(['ledger_lines', 'settlements'], load)
  useEffect(() => { void load() }, [load])
  return { rows, reload: load }
}
