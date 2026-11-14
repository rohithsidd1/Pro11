import { useEffect, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { rupees } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { Profile, WalletTxn, Withdrawal } from '../../lib/types'

interface Line { p: Profile; wallet: number; held: number; added: number; paidOut: number }

const monthStartIso = () => {
  const ist = new Date(Date.now() + 5.5 * 3600e3)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600e3).toISOString()
}

export function Balances() {
  const toast = useToast()
  const [lines, setLines] = useState<Line[]>([])
  const [txns, setTxns] = useState<WalletTxn[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [inGames, setInGames] = useState(0)

  useEffect(() => {
    void (async () => {
      const [pr, tx, wd, live] = await Promise.all([
        supabase.from('profiles').select('*').order('name'),
        supabase.from('wallet_txns').select('*').order('created_at', { ascending: false }).limit(10000),
        supabase.from('withdrawals').select('*').in('status', ['pending', 'paid']).limit(5000),
        supabase.from('contests').select('fee, entries(count)').in('status', ['open', 'locked', 'scored']),
      ])
      setInGames(((live.data ?? []) as { fee: number; entries: { count: number }[] }[]).reduce((n, c) => n + c.fee * (c.entries?.[0]?.count ?? 0), 0))
      const ps = (pr.data as Profile[] | null) ?? []
      const ts = (tx.data as WalletTxn[] | null) ?? []
      const ws = (wd.data as Withdrawal[] | null) ?? []
      const since = monthStartIso()
      setPeople(ps); setTxns(ts)
      setLines(ps.map((p) => ({
        p,
        wallet: ts.filter((t) => t.user_id === p.id).reduce((s, t) => s + t.amount, 0),
        held: ws.filter((w) => w.user_id === p.id && w.status === 'pending').reduce((s, w) => s + w.amount, 0),
        added: ts.filter((t) => t.user_id === p.id && t.kind === 'topup' && t.created_at >= since).reduce((s, t) => s + t.amount, 0),
        paidOut: ws.filter((w) => w.user_id === p.id && w.status === 'paid' && (w.handled_at ?? '') >= since).reduce((s, w) => s + w.amount, 0),
      })))
    })()
  }, [])

  const sum = (k: keyof Omit<Line, 'p'>) => lines.reduce((s, l) => s + l[k], 0)
  const holding = sum('wallet') + sum('held') + inGames

  const exportCsv = () => {
    const names = new Map(people.map((p) => [p.id, p.name]))
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [['Date (IST)', 'Member', 'Type', 'Amount (₹)', 'Note'].join(',')]
    for (const t of [...txns].reverse()) {
      const d = new Date(new Date(t.created_at).getTime() + 5.5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')
      rows.push([d, esc(names.get(t.user_id) ?? ''), t.kind, String(t.amount), esc(t.note ?? '')].join(','))
    }
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pro11-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('Ledger downloaded')
  }

  return (
    <Shell title="Balances" kicker="Money you’re holding" actions={<button className="btn sm" onClick={exportCsv}><Icon name="down" small /><span>Export</span></button>}>
      <div className="tiles three">
        <div className="tile" style={{ ['--c' as string]: 'var(--ink)', color: 'var(--paper)' }}>
          <span className="tile-k" style={{ color: '#D8CFC1' }}>You’re holding</span><span className="tile-v">{rupees(holding)}</span>
        </div>
        <div className="tile" style={{ ['--c' as string]: 'var(--mint)' }}><span className="tile-k">Added this month</span><span className="tile-v">{rupees(sum('added'))}</span></div>
        <div className="tile" style={{ ['--c' as string]: 'var(--blue)' }}><span className="tile-k">Paid out this month</span><span className="tile-v">{rupees(sum('paidOut'))}</span></div>
      </div>
      <p className="help" style={{ margin: '12px 0 4px' }}>Holding = everyone’s wallets + withdrawals you haven’t paid yet + entry fees in games that haven’t paid out (<span className="num">{rupees(inGames)}</span>).</p>
      <section className="panel" style={{ marginTop: 12 }}>
        <div className="tscroll">
          <table className="wtable">
            <thead><tr><th scope="col">Member</th><th scope="col" className="r">Wallet</th><th scope="col" className="r">To pay</th><th scope="col" className="r">Added this month</th><th scope="col" className="r">Paid out this month</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.p.id}>
                  <td><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={l.p.name} color={l.p.color} /><span className="rt" style={{ fontSize: 14.5 }}>{l.p.name}</span></span></td>
                  <td className="r num">{rupees(l.wallet)}</td>
                  <td className="r num">{l.held ? rupees(l.held) : '—'}</td>
                  <td className="r num">{l.added ? rupees(l.added) : '—'}</td>
                  <td className="r num">{l.paidOut ? rupees(l.paidOut) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  )
}
