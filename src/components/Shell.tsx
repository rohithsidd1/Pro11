import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { usePendingCodeCount } from '../lib/usePendingCodes'
import { useMoneyQueue } from '../lib/useWallet'
import { Avatar } from './Avatar'
import { OfflineBanner } from './OfflineBanner'
import { Icon, type IconName } from './Icon'

type NavItem = { to: string; icon: IconName; label: string; end?: boolean; count?: number }

const USER_NAV: NavItem[] = [
  { to: '/', icon: 'stumps', label: 'Matches', end: true },
  { to: '/wallet', icon: 'wallet', label: 'Wallet' },
  { to: '/ranks', icon: 'trophy', label: 'Ranks' },
  { to: '/me', icon: 'user', label: 'Me' },
]

export function Shell({ title, kicker, actions, back, children }: {
  title: string; kicker?: string; actions?: ReactNode; back?: string | boolean; children: ReactNode
}) {
  const { profile, isAdmin } = useAuth()
  const pending = usePendingCodeCount(isAdmin)
  const navigate = useNavigate()
  const money = useMoneyQueue(isAdmin)
  const adminNav: NavItem[] = [
    { to: '/admin', icon: 'shield', label: 'Dashboard', end: true },
    { to: '/admin/codes', icon: 'key', label: 'Sign-in codes', count: pending },
    { to: '/admin/payments', icon: 'receipt', label: 'Payments', count: money.payments },
    { to: '/admin/withdrawals', icon: 'up', label: 'Withdrawals', count: money.withdrawals },
    { to: '/admin/members', icon: 'user', label: 'Members' },
    { to: '/admin/balances', icon: 'wallet', label: 'Balances' },
    { to: '/admin/matches', icon: 'stumps', label: 'Matches' },
    { to: '/admin/data', icon: 'gauge', label: 'Cricket data' },
  ]
  const mobileNav: NavItem[] = isAdmin ? [...USER_NAV, { to: '/admin', icon: 'shield', label: 'Admin', count: pending + money.payments + money.withdrawals }] : USER_NAV

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <Link to="/" className="brandmark"><svg aria-hidden="true"><use href="#ball" /></svg><span>PRO11</span></Link>
        {USER_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `snav${isActive ? ' active' : ''}`}>
            <Icon name={n.icon} /><span>{n.label}</span>
          </NavLink>
        ))}
        {isAdmin && <p className="side-sec">Admin</p>}
        {isAdmin && adminNav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `snav${isActive ? ' active' : ''}`}>
            <Icon name={n.icon} /><span>{n.label}</span>
            {!!n.count && <span className="cnt" aria-label={`${n.count} waiting`}>{n.count}</span>}
          </NavLink>
        ))}
        <span className="grow" />
        {profile && (
          <Link to="/me" className="me">
            <Avatar name={profile.name} color={profile.color} />
            <span><span className="rt">{profile.name}</span><span className="rs">{isAdmin ? 'Admin' : 'Member'}</span></span>
          </Link>
        )}
      </nav>

      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {back && (
              <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
                <Icon name="back" />
              </button>
            )}
            <div className="topbar-title">
              {kicker && <p className="k">{kicker}</p>}
              <h1>{title}</h1>
            </div>
          </div>
          <div className="top-actions">{actions}</div>
        </header>
        <main className="page">
        <OfflineBanner />{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {mobileNav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
            <span style={{ position: 'relative' }}>
              <Icon name={n.icon} />
              {!!n.count && <span className="icon-dot" aria-label={`${n.count} waiting`} />}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
