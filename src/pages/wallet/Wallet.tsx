import { Link } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { istDate } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { useWallet, type HistoryItem } from '../../lib/useWallet'

const TONE: Record<HistoryItem['tone'], { b: string; c?: string }> = {
  plus: { b: 'var(--ok-bg)', c: 'var(--ok)' }, minus: { b: '#F3EDE1' }, neutral: { b: 'var(--warn-bg)', c: 'var(--warn)' },
}
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

export function Wallet() {
  const { balance, waitingTopups, waitingWithdrawals, items, loading } = useWallet()
  const groups: { month: string; items: HistoryItem[] }[] = []
  for (const it of items) {
    const m = monthOf(it.at)
    if (groups.at(-1)?.month !== m) groups.push({ month: m, items: [] })
    groups.at(-1)!.items.push(it)
  }

  return (
    <Shell title="Wallet">
      <div className="split-2">
        <div className="bal">
          <p className="bal-k">Balance</p>
          <p className="bal-v">{rupees(balance)}</p>
          {waitingTopups > 0 && <p className="bal-s"><span className="num">{rupees(waitingTopups)}</span> waiting for approval</p>}
          {waitingWithdrawals > 0 && <p className="bal-s"><span className="num">{rupees(waitingWithdrawals)}</span> withdrawal on its way to you</p>}
          <div className="btn-row">
            <Link to="/wallet/add" className="btn primary"><Icon name="down" /><span>Add money</span></Link>
            <Link to="/wallet/withdraw" className="btn"><Icon name="up" /><span>Withdraw</span></Link>
          </div>
        </div>

        <div>
          {!loading && items.length === 0 && (
            <Empty icon="wallet" title="No money moves yet">Add money to join games. Every top-up, entry, win and withdrawal shows up here.</Empty>
          )}
          {groups.map((g) => (
            <section key={g.month}>
              <h2 className="month">{g.month}</h2>
              <div className="list">
                {g.items.map((it) => {
                  const tone = TONE[it.tone]
                  const body = (
                    <>
                      <span className="ic" style={{ ['--b' as string]: tone.b, color: tone.c }}><Icon name={it.icon} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="rt">{it.title}</span>
                        <span className="rs">{[it.sub, istDate(it.at)].filter(Boolean).join(', ')}</span>
                      </span>
                      <span className="hist-right">
                        <span className={`amt ${it.tone}`}>{it.display}</span>
                        {it.tag && <span className={it.tag.cls}><span className="tx">{it.tag.label}</span></span>}
                      </span>
                    </>
                  )
                  return it.to
                    ? <Link key={it.key} to={it.to} className="row">{body}</Link>
                    : <div key={it.key} className="row">{body}</div>
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Shell>
  )
}
