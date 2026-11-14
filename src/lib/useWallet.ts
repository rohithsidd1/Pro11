import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { APP_LABEL, rupees } from './money'
import { supabase } from './supabase'
import type { PaymentProof, WalletTxn, Withdrawal } from './types'

export interface HistoryItem {
  key: string; at: string; title: string; sub: string; amount: number; display: string
  tone: 'plus' | 'minus' | 'neutral'; tag?: { label: string; cls: string }; to?: string; icon: 'down' | 'up' | 'receipt' | 'trophy' | 'refresh' | 'sliders' | 'clock' | 'x'
}

const WD_TAG: Record<Withdrawal['status'], { label: string; cls: string }> = {
  pending: { label: 'On its way', cls: 'tag warn' }, paid: { label: 'Paid', cls: 'tag ok' },
  rejected: { label: 'Rejected', cls: 'tag bad' }, cancelled: { label: 'Cancelled', cls: 'tag' },
}

/** Your wallet: balance from the ledger, money waiting, and one merged history. */
export function useWallet() {
  const { profile } = useAuth()
  const [txns, setTxns] = useState<WalletTxn[]>([])
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [wds, setWds] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const uid = profile?.id

  const load = useCallback(async () => {
    if (!uid) return
    const [t, p, w] = await Promise.all([
      supabase.from('wallet_txns').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(300),
      supabase.from('payment_proofs').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100),
      supabase.from('withdrawals').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100),
    ])
    setTxns((t.data as WalletTxn[] | null) ?? [])
    setProofs((p.data as PaymentProof[] | null) ?? [])
    setWds((w.data as Withdrawal[] | null) ?? [])
    setLoading(false)
  }, [uid])

  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', tick)
    const t = window.setInterval(tick, 30000)
    return () => { document.removeEventListener('visibilitychange', tick); window.clearInterval(t) }
  }, [load])

  const balance = txns.reduce((s, t) => s + t.amount, 0)
  const waitingTopups = proofs.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0)
  const waitingWithdrawals = wds.filter((w) => w.status === 'pending').reduce((s, w) => s + w.amount, 0)
  const wdById = new Map(wds.map((w) => [w.id, w]))
  const proofById = new Map(proofs.map((p) => [p.id, p]))

  const items: HistoryItem[] = []
  for (const t of txns) {
    const base = { key: `t-${t.id}`, at: t.created_at, amount: t.amount, display: rupees(t.amount, { sign: true }), tone: (t.amount > 0 ? 'plus' : 'minus') as HistoryItem['tone'] }
    if (t.kind === 'topup') {
      const p = t.ref_id ? proofById.get(t.ref_id) : undefined
      items.push({ ...base, title: 'Added money', sub: p ? APP_LABEL[p.app] : t.note ?? 'UPI', tag: { label: 'Approved', cls: 'tag ok' }, to: t.ref_id ? `/wallet/payment/${t.ref_id}` : undefined, icon: 'down' })
    } else if (t.kind === 'withdrawal') {
      const w = t.ref_id ? wdById.get(t.ref_id) : undefined
      items.push({ ...base, title: 'Withdrawal', sub: w ? `To ${w.upi_id}` : t.note ?? '', tag: w ? WD_TAG[w.status] : undefined, to: t.ref_id ? `/wallet/withdrawal/${t.ref_id}` : undefined, icon: 'up' })
    } else if (t.kind === 'withdrawal_release') {
      items.push({ ...base, title: 'Withdrawal returned', sub: t.note ?? '', to: t.ref_id ? `/wallet/withdrawal/${t.ref_id}` : undefined, icon: 'refresh' })
    } else if (t.kind === 'adjustment') {
      items.push({ ...base, title: t.amount > 0 ? 'Added by the admin' : 'Taken by the admin', sub: t.note ?? '', icon: 'sliders' })
    } else if (t.kind === 'entry') {
      items.push({ ...base, title: 'Game entry', sub: t.note ?? '', icon: 'receipt' })
    } else if (t.kind === 'refund') {
      items.push({ ...base, title: 'Refund', sub: t.note ?? '', icon: 'refresh' })
    } else {
      items.push({ ...base, title: 'Won', sub: t.note ?? '', icon: 'trophy' })
    }
  }
  for (const p of proofs) {
    if (p.status === 'approved') continue // shown through its ledger row
    const tag = p.status === 'pending' ? { label: 'Checking', cls: 'tag warn' } : p.status === 'rejected' ? { label: 'Rejected', cls: 'tag bad' } : { label: 'Cancelled', cls: 'tag' }
    items.push({ key: `p-${p.id}`, at: p.created_at, title: 'Added money', sub: APP_LABEL[p.app], amount: p.amount, display: rupees(p.amount), tone: 'neutral', tag, to: `/wallet/payment/${p.id}`, icon: p.status === 'pending' ? 'clock' : 'x' })
  }
  items.sort((a, b) => b.at.localeCompare(a.at))

  return { balance, waitingTopups, waitingWithdrawals, items, txns, proofs, wds, loading, reload: load }
}

/** Admin: counts of money waiting for action, for the nav and dashboard. */
export function useMoneyQueue(enabled: boolean, everyMs = 15000) {
  const [counts, setCounts] = useState({ payments: 0, withdrawals: 0 })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      const [p, w] = await Promise.all([
        supabase.from('payment_proofs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      if (alive) setCounts({ payments: p.count ?? 0, withdrawals: w.count ?? 0 })
    }
    void tick()
    const t = window.setInterval(tick, everyMs)
    document.addEventListener('visibilitychange', tick)
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [enabled, everyMs])
  return counts
}

/** Money settings everyone needs (UPI ID, limits). Readable by any signed-in member. */
export function useMoneySettings() {
  const { settings } = useAuth()
  return settings as unknown as import('./types').MoneySettings | null
}
