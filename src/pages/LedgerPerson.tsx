import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Empty } from '../components/Empty'
import { Icon } from '../components/Icon'
import { SettleSheet } from '../components/SettleSheet'
import { Shell } from '../components/Shell'
import { SkScreen } from '../components/Skeleton'
import { errorText } from '../lib/api'
import { istDayName, istTime } from '../lib/ist'
import { money, useLedger, useLedgerWith } from '../lib/useLedger'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const STATUS: Record<string, string> = { pending: 'waiting to be confirmed', rejected: 'not received', cancelled: 'cancelled', confirmed: '' }

export function LedgerPerson() {
  const { id = '' } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const { balances, reload: reloadAll } = useLedger()
  const { rows, reload } = useLedgerWith(id)
  const [paying, setPaying] = useState(false)
  const b = balances?.find((x) => x.user_id === id)
  if (!balances || !rows) return <Shell title="Ledger" back="/ledger"><SkScreen /></Shell>
  if (!b) return <Shell title="Ledger" back="/ledger"><Empty icon="user" title="Nothing with this person yet" /></Shell>
  const cancel = async (sid: string) => {
    const { error } = await supabase.rpc('cancel_payment', { p_id: sid })
    if (error) return toast(errorText(error))
    toast('Cancelled'); void reload(); void reloadAll()
  }
  return (
    <Shell title={b.name} kicker="Ledger" back="/ledger">
      <div style={{ maxWidth: 760, display: 'grid', gap: 12 }}>
        <section className={`bal-hero ${b.net > 0.004 ? 'pos' : b.net < -0.004 ? 'neg' : 'zero'}`} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar name={b.name} color={b.color} size="xl" />
          <span style={{ flex: 1 }}>
            <span className="rt">{b.net > 0.004 ? `${b.name.split(' ')[0]} owes you` : b.net < -0.004 ? `You owe ${b.name.split(' ')[0]}` : 'Settled up'}</span>
            <span className="big" style={{ display: 'block', fontSize: 36 }}>{money(Math.abs(b.net))}</span>
          </span>
          {b.net < -0.004 && <button className="btn primary" onClick={() => setPaying(true)}><span>Settle up</span></button>}
        </section>
        <div className="sec"><h2>History</h2><span className="aside">newest first</span></div>
        {rows.length === 0 && <Empty icon="log" title="No history yet" />}
        <div className="list">
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: '44px 1fr auto', opacity: r.status === 'cancelled' || r.status === 'rejected' ? 0.6 : 1 }}>
              <span className="ic" style={{ ['--b' as string]: r.kind === 'game' ? 'var(--lemon)' : 'var(--mint)' }}><Icon name={r.kind === 'game' ? 'trophy' : 'send'} /></span>
              <span style={{ minWidth: 0 }}>
                {r.link ? <Link to={r.link} className="rt" style={{ color: 'inherit' }}>{r.title}</Link> : <span className="rt">{r.title}</span>}
                <span className="rs">{[r.detail, STATUS[r.status], `${istDayName(r.at)} ${istTime(r.at)}`].filter(Boolean).join(' · ')}</span>
                {r.kind === 'payment' && r.status === 'pending' && r.amount > 0 && r.settlement_id && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => cancel(r.settlement_id!)}><span>Cancel</span></button>}
              </span>
              <span className={r.status === 'cancelled' || r.status === 'rejected' ? 'help num' : r.amount > 0 ? 'owe-pos num' : 'owe-neg num'}>{money(r.amount, true)}</span>
            </div>
          ))}
        </div>
        <p className="fine" style={{ paddingLeft: 0 }}>+ means it adds to what {b.name.split(' ')[0]} owes you; − adds to what you owe. Payments count once confirmed.</p>
      </div>
      {paying && <SettleSheet person={b} onClose={() => setPaying(false)} onDone={() => { setPaying(false); void reload(); void reloadAll(); navigate(`/ledger/${id}`) }} />}
    </Shell>
  )
}
