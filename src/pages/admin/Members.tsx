import { useCallback, useEffect, useState } from 'react'
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

export function Members() {
  const { profile: me } = useAuth()
  const toast = useToast()
  const [people, setPeople] = useState<Profile[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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

  const q = query.trim().toLowerCase()
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, '')))

  return (
    <Shell title="Members" kicker={`${people.length} people`}>
      <div className="input" style={{ marginBottom: 16, maxWidth: 520 }}>
        <svg className="i" aria-hidden="true"><use href="#i-search" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone" aria-label="Search members" />
      </div>
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
                  <AdjustWallet person={p} />
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


const ADJUST_REASONS = ['Cash given', 'Cash received', 'Correction', 'Gift']

function AdjustWallet({ person }: { person: Profile }) {
  const toast = useToast()
  const [balance, setBalance] = useState<number | null>(null)
  const [dir, setDir] = useState<'add' | 'take'>('add')
  const [amountText, setAmountText] = useState('')
  const [reason, setReason] = useState(ADJUST_REASONS[2])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const loadBalance = useCallback(async () => {
    const { data } = await supabase.rpc('wallet_balance', { p_user: person.id })
    setBalance(typeof data === 'number' ? data : 0)
  }, [person.id])
  useEffect(() => { void loadBalance() }, [loadBalance])
  const amount = Math.floor(Number(amountText) || 0)

  const save = async () => {
    if (amount <= 0) return toast('Enter an amount')
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_adjust_wallet', {
      p_user: person.id, p_amount: dir === 'add' ? amount : -amount, p_reason: note.trim() ? `${reason}: ${note.trim()}` : reason,
    })
    setBusy(false)
    if (error) return toast(errorText(error))
    setBalance(data as number); setAmountText(''); setNote('')
    toast(`${person.name.split(' ')[0]}’s wallet is now ${rupees(data as number)}`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <span className="rt" style={{ fontSize: 14.5 }}>Wallet</span>
        <span className="amt">{balance === null ? '…' : rupees(balance)}</span>
      </div>
      <div className="seg sm" role="group" aria-label="Add or take" style={{ marginTop: 8, maxWidth: 320 }}>
        <button aria-pressed={dir === 'add'} onClick={() => setDir('add')}>Add money</button>
        <button aria-pressed={dir === 'take'} onClick={() => setDir('take')}>Take money</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr)', gap: 8, marginTop: 10 }}>
        <div className="input"><span className="pre">₹</span><input className="num" inputMode="numeric" value={amountText} placeholder="0" aria-label="Amount"
          onChange={(e) => setAmountText(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
        <div className="input"><input value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="Note (optional)" aria-label="Note" /></div>
      </div>
      <div className="chips" role="group" aria-label="Reason" style={{ marginTop: 10, width: 'fit-content' }}>
        {ADJUST_REASONS.map((r) => <button key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}
      </div>
      <button className="btn sm" style={{ marginTop: 12 }} disabled={busy || amount <= 0} onClick={save}>
        {busy ? <span className="spinner" /> : <><Icon name="sliders" small /><span>{dir === 'add' ? 'Add' : 'Take'} {amount > 0 ? rupees(amount) : 'money'}</span></>}
      </button>
      <p className="help" style={{ marginTop: 8 }}>{person.name.split(' ')[0]} gets a notification with the reason. A wallet can’t go below ₹0.</p>
    </div>
  )
}
