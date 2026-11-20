import { useEffect, useState } from 'react'
import { Empty } from '../../components/Empty'
import { Shell } from '../../components/Shell'
import { SkRows } from '../../components/Skeleton'
import { money } from '../../lib/useLedger'
import { supabase } from '../../lib/supabase'

interface Pair { debtor: string; debtor_name: string; creditor: string; creditor_name: string; amount: number }

/** Admin: who owes whom across the whole group. */
export function AdminLedger() {
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    void supabase.rpc('admin_ledger').then(({ data }) => setPairs(((data ?? []) as Pair[]).map((p) => ({ ...p, amount: Number(p.amount) }))))
    void supabase.from('settlements').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setWaiting(count ?? 0))
  }, [])
  const total = (pairs ?? []).reduce((n, p) => n + p.amount, 0)
  return (
    <Shell title="Ledger" kicker="Everyone" back="/admin">
      <div style={{ maxWidth: 760 }}>
        <div className="kv3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div><p className="k">Still to settle</p><p className="v">{money(total)}</p></div>
          <div><p className="k">Payments waiting to be confirmed</p><p className="v">{waiting}</p></div>
        </div>
        <div className="sec"><h2>Who owes whom</h2></div>
        {!pairs ? <SkRows n={5} avatar={false} /> : pairs.length === 0 ? <Empty icon="check" title="Everyone is settled up" /> : (
          <div className="list">
            {pairs.map((p) => (
              <div key={p.debtor + p.creditor} className="row nolead" style={{ gridTemplateColumns: '1fr auto' }}>
                <span><span className="rt">{p.debtor_name} owes {p.creditor_name}</span></span>
                <span className="owe-neg num">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
