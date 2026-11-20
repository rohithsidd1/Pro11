import { useCallback, useEffect, useState } from 'react'
import { whatsappLink } from '../../lib/phone'
import { Avatar } from '../../components/Avatar'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatPhone } from '../../lib/phone'
import { rupees } from '../../lib/money'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import { dayLabel } from '../../lib/time'
import { useToast } from '../../lib/toast'
import type { Profile } from '../../lib/types'
import { SkRows } from '../../components/Skeleton'
import { SearchBar } from '../../components/SearchBar'
import { smartFilter } from '../../lib/search'

export function Members() {
  const { profile: me } = useAuth()
  const toast = useToast()
  const [people, setPeople] = useState<Profile[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [invites, setInvites] = useState<{ phone: string; name: string; role: string }[]>([])
  const loadInvites = useCallback(async () => {
    const { data } = await supabase.from('invites').select('*').is('used_at', null).order('created_at', { ascending: false })
    setInvites((data as never) ?? [])
  }, [])
  useEffect(() => { void loadInvites() }, [loadInvites])

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setPeople((data as Profile[] | null) ?? [])
  }, [])
  useEffect(() => { void load() }, [load])

  const update = async (id: string, patch: { p_role?: 'admin' | 'member'; p_blocked?: boolean; p_can_play?: boolean }, done: string) => {
    const { error } = await supabase.rpc('admin_update_member', { p_id: id, ...patch })
    if (error) return toast(errorText(error))
    toast(done); void load()
  }

  const shown = smartFilter(people, query, (p) => [p.name, p.phone, p.role])

  return (
    <Shell title="Members" back="/admin" kicker={`${people.length} people`} actions={<button className="btn sm primary" onClick={() => setAdding((a) => !a)}><Icon name="plus" small /><span>Add member</span></button>}>
      {adding && <AddMember onDone={() => { setAdding(false); void loadInvites() }} />}
      {invites.length > 0 && (
        <section className="panel" style={{ marginBottom: 16, maxWidth: 720 }}>
          <div className="ch"><h3>Added, not signed in yet</h3><span className="help num">{invites.length}</span></div>
          <div className="list">
            {invites.map((i) => (
              <div key={i.phone} className="row nolead" style={{ background: 'var(--sand)', gridTemplateColumns: '1fr auto' }}>
                <span><span className="rt">{i.name}{i.role === 'admin' ? ' (admin)' : ''}</span><span className="rs num">{formatPhone(i.phone)}</span></span>
                <button className="btn sm" onClick={async () => { const { error } = await supabase.rpc('admin_cancel_invite', { p_phone: i.phone }); if (error) toast(errorText(error)); else { toast('Removed'); void loadInvites() } }}><span>Remove</span></button>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="search-wrap" style={{ maxWidth: 520 }}><SearchBar value={query} onChange={setQuery} placeholder="Search by name or phone" label="Search members" /></div>
      <div className="list">
        {shown.map((p) => {
          const isMe = p.id === me?.id
          const expanded = open === p.id
          return (
            <div key={p.id} className="panel" style={{ padding: 0 }}>
              <button className="row" style={{ background: 'transparent' }} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : p.id)}>
                <Avatar name={p.name} color={p.color} />
                <span>
                  <span className="rt">{p.name}{isMe && ' (you)'}</span>
                  <span className="rs"><span className="num">{formatPhone(p.phone)}</span>{p.last_seen_at ? `, seen ${dayLabel(p.last_seen_at).toLowerCase()}` : ''}</span>
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {p.role === 'admin' && <span className="tag ink"><span className="tx">Admin</span></span>}
                  {p.blocked && <span className="tag bad"><span className="tx">Blocked</span></span>}
                  {!p.can_play && !p.blocked && <span className="tag warn"><span className="tx">Can’t play</span></span>}
                </span>
              </button>
              {expanded && (
                <div style={{ padding: '0 16px 16px' }}>
                  <div className="divider" style={{ marginTop: 0 }} />
                  <Toggle label="Admin" sub="Can approve payments and change settings" checked={p.role === 'admin'} disabled={isMe}
                    onChange={(v) => update(p.id, { p_role: v ? 'admin' : 'member' }, v ? `${p.name} is now an admin` : `${p.name} is now a member`)} />
                  <Toggle label="Can join games" checked={p.can_play}
                    onChange={(v) => update(p.id, { p_can_play: v }, v ? 'Can join games' : 'Can’t join games')} />
                  <Toggle label="Blocked" sub="Signs them out and stops new codes" checked={p.blocked} disabled={isMe}
                    onChange={(v) => update(p.id, { p_blocked: v }, v ? `${p.name} is blocked` : `${p.name} is unblocked`)} />
                  {isMe && <p className="help" style={{ marginTop: 8 }}>You can’t remove your own admin role or block yourself.</p>}
                  <div className="divider" />
                  <MemberStats person={p} />
                  <ChangePhone person={p} onDone={() => void load()} />
                  {!isMe && (
                    <button className="btn sm" style={{ marginTop: 10 }} onClick={async () => {
                      if (!window.confirm(`Sign ${p.name.split(' ')[0]} out on all their devices? They can sign in again with a new code.`)) return
                      const { error } = await supabase.rpc('admin_signout_member', { p_user: p.id })
                      if (error) toast(errorText(error)); else toast(`${p.name.split(' ')[0]} will be signed out`)
                    }}><Icon name="logout" small /><span>Sign out on all devices</span></button>
                  )}

                </div>
              )}
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

function Toggle({ label, sub, checked, disabled, onChange }: {
  label: string; sub?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, cursor: disabled ? 'default' : 'pointer' }}>
      <span><span className="rt" style={{ fontSize: 14.5 }}>{label}</span>{sub && <span className="rs">{sub}</span>}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}



function AddMember({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const { settings } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [invite, setInvite] = useState(true)
  const [busy, setBusy] = useState(false)
  const digits = phone.replace(/\D/g, '').slice(-10)
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_add_member', { p_name: name.trim(), p_phone: digits, p_role: role })
    setBusy(false)
    if (error) return toast(errorText(error))
    toast(`${name.trim().split(' ')[0]} added`)
    if (invite) {
      const app = (settings as unknown as { app_name?: string })?.app_name ?? 'Pro11'
      window.open(whatsappLink('+91' + digits, `Hi ${name.trim().split(' ')[0]}! Join our family cricket games on ${app}: ${window.location.origin}. Sign in with your name and this number, then send me the code you get.`), '_blank')
    }
    onDone()
  }
  return (
    <section className="panel" style={{ marginBottom: 16, maxWidth: 720 }}>
      <div className="ch"><h3>Add member</h3></div>
      <div className="cols-2" style={{ gap: 12 }}>
        <div className="field" style={{ margin: 0 }}><label htmlFor="am-n">Name</label><div className="input"><input id="am-n" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Kiran" /></div></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="am-p">Phone number</label><div className="input"><span className="pre">+91</span><input id="am-p" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="91234 56789" /></div></div>
      </div>
      <div className="rule stacked" style={{ marginTop: 6 }}><p className="k">Role</p>
        <div className="seg sm" style={{ maxWidth: 320 }}><button aria-pressed={role === 'member'} onClick={() => setRole('member')}>Member</button><button aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>Admin</button></div></div>
            <label className="rule" style={{ cursor: 'pointer' }}><div><p className="k">Send a WhatsApp invite</p><p className="s">Opens WhatsApp with a link to Pro11</p></div>
        <input type="checkbox" role="switch" className="switch" checked={invite} onChange={(e) => setInvite(e.target.checked)} /></label>
      <p className="help" style={{ marginTop: 8 }}>{name.trim() ? name.trim().split(' ')[0] : 'They'} can ask for a sign-in code once added. Codes come to you.</p>
      <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || name.trim().length < 2 || !/^[6-9]\d{9}$/.test(digits)} onClick={save}>
        {busy ? <span className="spinner" /> : <span>Add {name.trim().split(' ')[0] || 'member'}</span>}</button>
    </section>
  )
}

function MemberStats({ person }: { person: Profile }) {
  const [st, setSt] = useState<{ wallet: number; inGames: number; played: number; net: number; recent: { note: string | null; kind: string; amount: number; created_at: string }[] } | null>(null)
  useEffect(() => {
    void (async () => {
      const [t, e] = await Promise.all([
        supabase.from('ledger_lines').select('amount, created_at, from_user, contests(game, match_id)').or(`from_user.eq.${person.id},to_user.eq.${person.id}`).order('created_at', { ascending: false }).limit(200),
        supabase.from('entries').select('payout, contests!inner(fee, status)').eq('user_id', person.id),
      ])
      const ent = ((e.data ?? []) as unknown as { payout: number; contests: { fee: number; status: string } }[])
      setSt({
        wallet: ((t.data ?? []) as { amount: number; from_user: string }[]).reduce((n, l) => n + (l.from_user === person.id ? -Number(l.amount) : Number(l.amount)), 0),
        inGames: ent.filter((x) => ['open', 'locked', 'scored'].includes(x.contests.status)).reduce((n, x) => n + x.contests.fee, 0),
        played: ent.filter((x) => x.contests.status === 'paid').length,
        net: ent.filter((x) => x.contests.status === 'paid').reduce((n, x) => n + x.payout - x.contests.fee, 0),
        recent: [],
      })
    })()
  }, [person.id])
  if (!st) return <SkRows n={2} avatar={false} />
  return (
    <div>
      <div className="kv3" style={{ marginTop: 4 }}>
        <div style={{ background: 'var(--soft)' }}><p className="k">From games, before settling</p><p className="v">{rupees(st.wallet, { sign: true })}</p></div>
        <div style={{ background: 'var(--soft)' }}><p className="k">Stakes in open games</p><p className="v">{rupees(st.inGames)}</p></div>
        <div style={{ background: 'var(--soft)' }}><p className="k">Net from {st.played} games</p><p className="v">{rupees(st.net, { sign: true })}</p></div>
      </div>
      {st.recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {st.recent.map((r, i) => (
            <div key={i} className="read"><span className="k">{r.note ?? r.kind.replace('_', ' ')}<br /><span className="help">{dayLabel(r.created_at)}</span></span><span className="v">{rupees(r.amount, { sign: true })}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangePhone({ person, onDone }: { person: Profile; onDone: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = phone.replace(/\D/g, '').slice(-10)
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_change_phone', { p_user: person.id, p_phone: digits })
    setBusy(false)
    if (error) return toast(errorText(error))
    toast(`${person.name.split(' ')[0]} now signs in with +91 ${digits.slice(0, 5)} ${digits.slice(5)}`)
    setOpen(false); setPhone(''); onDone()
  }
  if (!open) return <button className="btn sm" style={{ marginTop: 10, marginRight: 8 }} onClick={() => setOpen(true)}><Icon name="phone" small /><span>Change phone number</span></button>
  return (
    <div style={{ marginTop: 10 }}>
      <div className="field" style={{ margin: 0 }}><label htmlFor={`ph-${person.id}`}>New phone number</label>
        <div className="input"><span className="pre">+91</span><input id={`ph-${person.id}`} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="91234 56789" /></div>
        <p className="help">Their games, ledger and history stay the same. Next time they sign in, they use the new number.</p></div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => setOpen(false)}><span>Cancel</span></button>
        <button className="btn sm primary" disabled={busy || !/^[6-9]\d{9}$/.test(digits)} onClick={save}>{busy ? <span className="spinner" /> : <span>Save number</span>}</button>
      </div>
    </div>
  )
}
