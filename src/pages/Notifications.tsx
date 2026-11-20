import { useNavigate } from 'react-router-dom'
import { Empty } from '../components/Empty'
import { Icon, type IconName } from '../components/Icon'
import { Shell } from '../components/Shell'
import { istDayName, istTime } from '../lib/ist'
import { useNotifications, type Notice } from '../lib/useNotifications'
import { SkRows } from '../components/Skeleton'

const ICON: Record<string, [IconName, string]> = {
  contest_scored: ['trophy', 'var(--lemon)'], contest_paid: ['trophy', 'var(--mint)'],
  contest_cancelled: ['ban', 'var(--soft)'],
  squads_out: ['stumps', 'var(--mint)'], xi_out: ['user', 'var(--mint)'], lock_soon: ['clock', 'var(--warn-bg)'],
  admin_alert: ['alert', 'var(--warn-bg)'], broadcast: ['send', 'var(--lemon)'],
  payment_claimed: ['wallet', 'var(--warn-bg)'], payment_confirmed: ['check', 'var(--ok-bg)'], payment_disputed: ['x', 'var(--bad-bg)'],
}

export function Notifications() {
  const { items, unread, loading, markRead } = useNotifications()
  const navigate = useNavigate()
  const open = (n: Notice) => { void markRead([n.id]); if (n.link) navigate(n.link) }
  return (
    <Shell title="Notifications" back="/" kicker={unread ? `${unread} unread` : 'All caught up'}
      actions={unread > 0 ? <button className="btn sm" onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}><Icon name="check" small /><span>Read all</span></button> : undefined}>
      {loading && <SkRows n={6} />}
      {!loading && items.length === 0 && <Empty icon="bell" title="Nothing yet">Game results, alerts and payments to confirm show up here.</Empty>}
      <div className="list" style={{ maxWidth: 720 }}>
        {items.map((n) => {
          const [icon, bg] = ICON[n.kind] ?? ['bell', 'var(--soft)']
          return (
            <button key={n.id} className={`row notice${n.read_at ? '' : ' unread'}`} onClick={() => open(n)}>
              <span className="ic" style={{ ['--b' as string]: bg }}><Icon name={icon} /></span>
              <span style={{ minWidth: 0 }}>
                <span className="rt">{n.title}</span>
                <span className="rs">{[n.body, `${istDayName(n.created_at)} ${istTime(n.created_at)}`].filter(Boolean).join(' · ')}</span>
              </span>
              {n.read_at ? <Icon name="chev" /> : <span className="dot" aria-label="Unread" />}
            </button>
          )
        })}
      </div>
    </Shell>
  )
}
