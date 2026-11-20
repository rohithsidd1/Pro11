import { useEffect, useState } from 'react'
import { istDayName, istTime } from '../../lib/ist'
import { shortTeam } from '../../lib/cricket'
import { Link } from 'react-router-dom'
import { CodeCard } from '../../components/CodeCard'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/useLedger'
import { useToast } from '../../lib/toast'
import { useCodes } from '../../lib/useCodes'
import type { IconName } from '../../components/Icon'
import { SkRows } from '../../components/Skeleton'

export function AdminHome() {
  const { profile } = useAuth()
  const toast = useToast()
  const { waiting, reload } = useCodes()
  const { settings } = useAuth()
  const [owed, setOwed] = useState<number | null>(null)
  const [waitingPay, setWaitingPay] = useState(0)
  useEffect(() => {
    void supabase.rpc('admin_ledger').then(({ data }) => setOwed(((data ?? []) as { amount: number }[]).reduce((n, p) => n + Number(p.amount), 0)))
    void supabase.from('settlements').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setWaitingPay(count ?? 0))
  }, [])
  const [members, setMembers] = useState(0)
  const [needs, setNeeds] = useState<{ id: string; match_id: string; status: string; lock_at: string; matches: { team_a: string; team_b: string; label: string | null } }[] | null>(null)
  useEffect(() => {
    void supabase.from('contests').select('id, match_id, status, lock_at, matches!inner(team_a, team_b, label)').in('status', ['locked', 'scored']).order('lock_at')
      .then(({ data }) => setNeeds((data as never) ?? []))
  }, [])
  useEffect(() => {
    void supabase.from('profiles').select('id', { count: 'exact', head: true }).then(({ count }) => setMembers(count ?? 0))
  }, [])

  const signEveryoneOut = async () => {
    if (!window.confirm('Sign everyone out, including you? Everyone will need a new code.')) return
    const { error } = await supabase.rpc('admin_sign_everyone_out')
    toast(error ? 'Couldn’t sign everyone out.' : 'Everyone will be signed out on their next visit')
  }

  return (
    <Shell title={`Hi ${profile?.name.split(' ')[0] ?? ''}`} kicker="Admin" actions={<span className="admin-tag"><Icon name="shield" small /><span className="tx">Admin</span></span>}>
      <div className="tiles four">
        <Link to="/admin/codes" className="tile" style={{ ['--c' as string]: 'var(--lemon)' }}>
          <span className="tile-k">Sign-in codes waiting</span><span className="tile-v">{waiting.length}</span>
        </Link>
        <Link to="/admin/ledger" className="tile" style={{ ['--c' as string]: 'var(--pink)' }}>
          <span className="tile-k">Still to settle</span><span className="tile-v">{owed === null ? '…' : money(owed)}</span>
        </Link>
        <Link to="/admin/ledger" className="tile" style={{ ['--c' as string]: 'var(--blue)' }}>
          <span className="tile-k">Payments waiting to be confirmed</span><span className="tile-v">{waitingPay}</span>
        </Link>
        <Link to="/admin/data" className="tile" style={{ ['--c' as string]: 'var(--mint)' }}>
          <span className="tile-k">Cricket data</span>
          <span className="tile-v" style={{ fontSize: 22 }}>{(settings as unknown as { last_cb_list_at?: string })?.last_cb_list_at ? `Updated ${istTime((settings as unknown as { last_cb_list_at: string }).last_cb_list_at)}` : 'Waiting'}</span>
        </Link>
      </div>

      {waiting.length > 0 && (
        <>
          <div className="sec"><h2>Sign-in codes</h2><Link to="/admin/codes" className="aside">See all</Link></div>
          <div className="list" style={{ maxWidth: 560 }}>{waiting.slice(0, 2).map((r) => <CodeCard key={r.id} req={r} onChange={reload} />)}</div>
        </>
      )}

      {needs === null && <div style={{ marginTop: 16 }}><SkRows n={2} avatar={false} /></div>}
      {needs && needs.length > 0 && (
        <>
          <div className="sec"><h2>Games in progress</h2><span className="aside">all automatic</span></div>
          <div className="list" style={{ maxWidth: 560 }}>
            {needs.map((c) => (
              <Link key={c.id} to={`/admin/match/${c.match_id}`} className="row">
                <span className="ic" style={{ ['--b' as string]: 'var(--warn-bg)' }}><Icon name={c.status === 'scored' ? 'trophy' : 'user'} /></span>
                <span><span className="rt">{shortTeam(c.matches.team_a)} vs {shortTeam(c.matches.team_b)}</span>
                  <span className="rs">{c.status === 'scored' ? 'Scored. Final results come automatically.' : `Locked ${istDayName(c.lock_at).toLowerCase()} ${istTime(c.lock_at)}. Waiting for the Playing XI from Cricbuzz.`}</span></span>
                <Icon name="chev" />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="sec"><h2>Manage</h2></div>
      <div className="list" style={{ maxWidth: 560 }}>
        {MANAGE.map((m) => (
          <Link key={m.to} to={m.to} className="row">
            <span className="ic"><Icon name={m.icon} /></span>
            <span><span className="rt">{m.label}{m.to === '/admin/members' ? ` (${members})` : ''}</span><span className="rs">{m.sub}</span></span>
            <Icon name="chev" />
          </Link>
        ))}
      </div>

      <div className="sec"><h2>Safety</h2></div>
      <button className="btn danger" onClick={signEveryoneOut}><Icon name="logout" /><span>Sign everyone out</span></button>
          <p className="fine" style={{ paddingLeft: 0, marginTop: 16 }}>App version: {new Date(__BUILD_TIME__).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST. If this looks old, reload the page.</p>
    </Shell>
  )
}

const MANAGE: { to: string; icon: IconName; label: string; sub: string }[] = [
  { to: '/admin/members', icon: 'user', label: 'Members', sub: 'Roles, blocking, phone numbers' },
  { to: '/admin/ledger', icon: 'wallet', label: 'Ledger', sub: 'Who owes whom across everyone' },
  { to: '/admin/rules', icon: 'trophy', label: 'Game rules', sub: 'Points, lock time, fees, ties' },
  { to: '/admin/matches', icon: 'stumps', label: 'Matches', sub: 'Show or hide matches' },
  { to: '/admin/data', icon: 'gauge', label: 'Cricket data', sub: 'Cricbuzz sync, which matches to show' },
  { to: '/admin/notifications', icon: 'bell', label: 'Notifications', sub: 'What members are told, message everyone' },
  { to: '/admin/general', icon: 'sliders', label: 'General', sub: 'App name, admin name, home tab' },
  { to: '/admin/badges', icon: 'image', label: 'Team badges', sub: 'Upload logos for clubs and leagues' },
  { to: '/admin/appearance', icon: 'eye', label: 'Appearance', sub: 'Notched or plain match cards' },
  { to: '/admin/signin', icon: 'key', label: 'Sign-in settings', sub: 'Code length, how long people stay signed in' },
  { to: '/admin/activity', icon: 'log', label: 'Activity log', sub: 'Every money and game action' },
  { to: '/admin/backup', icon: 'down', label: 'Backup', sub: 'Download everything as one file' },
]
