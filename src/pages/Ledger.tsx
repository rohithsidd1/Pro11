import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Empty } from '../components/Empty'
import { Icon } from '../components/Icon'
import { SettleSheet } from '../components/SettleSheet'
import { Shell } from '../components/Shell'
import { SkScreen, SkSwap } from '../components/Skeleton'
import { errorText } from '../lib/api'
import { istDayName, istTime } from '../lib/ist'
import { money, useLedger, type Balance } from '../lib/useLedger'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

/** Who owes whom, like Splitwise: my overall balance, then each person. */
export function Ledger() {
  const toast = useToast()
  const { balances, incoming, error, reload, owedToMe, iOwe, total } = useLedger()
  const [paying, setPaying] = useState<Balance | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const decide = async (id: string, ok: boolean) => {
    setBusy(id)
    const { error: e } = await supabase.rpc('decide_payment', { p_id: id, p_confirm: ok })
    setBusy(null)
    if (e) return toast(errorText(e))
    toast(ok ? 'Confirmed. Balances updated.' : 'Marked as not received.'); void reload()
  }

  if (error) return <Shell title="Ledger"><Empty icon="alert" title="Couldn’t load the ledger" action={<button className="btn" onClick={() => void reload()}><span>Try again</span></button>}>{error}</Empty></Shell>

  const people = (balances ?? []).filter((b) => Math.abs(b.net) >= 0.01 || b.waiting_out || b.waiting_in)
  const settled = (balances ?? []).filter((b) => !people.includes(b))
  return (
    <Shell title="Ledger" kicker="Who owes whom">
      <SkSwap loading={!balances} skeleton={<SkScreen />}>{() => (<>
      <div className="split-2">
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <section className={`bal-hero ${total > 0.004 ? 'pos' : total < -0.004 ? 'neg' : 'zero'}`}>
            <p className="rt">{total > 0.004 ? 'Overall, you get back' : total < -0.004 ? 'Overall, you owe' : 'You’re all settled up'}</p>
            <p className="big">{money(Math.abs(total))}</p>
            <div className="bal-split">
              <div><p className="rs" style={{ marginTop: 0 }}>Others owe you</p><p className="owe-pos num">{money(owedToMe)}</p></div>
              <div><p className="rs" style={{ marginTop: 0 }}>You owe</p><p className="owe-neg num">{money(iOwe)}</p></div>
            </div>
          </section>

          {incoming.length > 0 && (
            <section className="panel">
              <div className="ch"><h3>Confirm payments</h3><span className="tag warn"><span className="tx">{incoming.length}</span></span></div>
              <div className="list">
                {incoming.map((c) => (
                  <div key={c.id} className="row" style={{ background: 'var(--sand)', gridTemplateColumns: '44px 1fr', alignItems: 'start' }}>
                    <Avatar name={c.who?.name ?? '?'} color={c.who?.color ?? '#C7B6F7'} />
                    <span>
                      <span className="rt">{c.who?.name} says they paid you {money(c.amount)}</span>
                      <span className="rs">{[c.note, `${istDayName(c.created_at)} ${istTime(c.created_at)}`].filter(Boolean).join(' · ')}</span>
                      <span className="btn-row" style={{ marginTop: 8 }}>
                        <button className="btn sm" disabled={busy === c.id} onClick={() => decide(c.id, false)}><span>Not received</span></button>
                        <button className="btn sm primary" disabled={busy === c.id} onClick={() => decide(c.id, true)}>{busy === c.id ? <span className="spinner" /> : <><Icon name="check" small /><span>Received</span></>}</button>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div>
          <div className="sec" style={{ paddingTop: 0 }}><h2>People</h2><span className="aside">tap for history</span></div>
          {people.length === 0 && <Empty icon="check" title="Nothing to settle">When a game finishes, who owes whom shows up here.</Empty>}
          <div className="list">
            {people.map((b) => (
              <div key={b.user_id} className="row" style={{ gridTemplateColumns: '44px 1fr auto' }}>
                <Avatar name={b.name} color={b.color} />
                <Link to={`/ledger/${b.user_id}`} style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                  <span className="rt">{b.name}</span>
                  <span className="rs">
                    {b.net > 0.004 ? <span className="owe-pos">owes you {money(b.net)}</span> : b.net < -0.004 ? <span className="owe-neg">you owe {money(-b.net)}</span> : 'settled up'}
                    {b.waiting_out ? ` · ${money(b.waiting_out)} waiting for them to confirm` : ''}{b.waiting_in ? ` · confirm ${money(b.waiting_in)}` : ''}
                  </span>
                </Link>
                {b.net < -0.004 ? <button className="btn sm primary" onClick={() => setPaying(b)}><span>Settle up</span></button> : <Link className="icon-btn" to={`/ledger/${b.user_id}`} aria-label={`History with ${b.name}`}><Icon name="chev" /></Link>}
              </div>
            ))}
          </div>
          {settled.length > 0 && <p className="fine" style={{ paddingLeft: 0 }}>All square with {settled.map((s) => s.name.split(' ')[0]).join(', ')}.</p>}
          <p className="fine" style={{ paddingLeft: 0 }}>When a game finishes, each player who lost owes the winner their entry (split equally between tied winners). Amounts are netted per person across all games.</p>
        </div>
      </div>
      {paying && <SettleSheet person={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); void reload() }} />}
      </>)}</SkSwap>
    </Shell>
  )
}
