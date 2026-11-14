import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatPhone } from '../../lib/phone'
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

