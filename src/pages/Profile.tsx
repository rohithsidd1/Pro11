import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Shell } from '../components/Shell'
import { errorText } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPhone } from '../lib/phone'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const COLORS = ['#FFD3EF', '#C7B6F7', '#BFE3FF', '#BDF59A', '#FFE2B8', '#FFF59E']
const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/

export function Profile() {
  const { profile, isAdmin, refresh, signOut } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState(profile?.color ?? COLORS[0])
  const [upi, setUpi] = useState(profile?.upi_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!profile) return null

  const dirty = name.trim() !== profile.name || color !== profile.color || (upi.trim() || null) !== profile.upi_id

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = name.trim().replace(/\s+/g, ' ')
    const u = upi.trim()
    if (n.length < 2 || n.length > 40) return setError('Name must be 2 to 40 letters.')
    if (u && !UPI_RE.test(u)) return setError('That doesn’t look like a UPI ID, for example name@okaxis.')
    setBusy(true)
    const { error: err } = await supabase.from('profiles').update({ name: n, color, upi_id: u || null }).eq('id', profile.id)
    setBusy(false)
    if (err) return setError(errorText(err))
    await refresh()
    toast('Saved')
  }

  return (
    <Shell title="Me">
      <div className="cols-2">
        <div className="panel" style={{ textAlign: 'center', padding: 28 }}>
          <Avatar name={name || profile.name} color={color} size="xl" />
          <p style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, letterSpacing: '-.035em', marginTop: 12 }}>{profile.name}</p>
          <p className="num" style={{ color: 'var(--muted)', fontWeight: 500 }}>{formatPhone(profile.phone)}</p>
          <p style={{ marginTop: 10 }}><span className={isAdmin ? 'tag ink' : 'tag'}><span className="tx">{isAdmin ? 'Admin' : 'Member'}</span></span></p>
        </div>

        <form className="panel" onSubmit={save}>
          <div className="field">
            <label htmlFor="me-name">Name</label>
            <div className="input"><input id="me-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></div>
          </div>
          <div className="field">
            <span style={{ fontSize: 13, fontWeight: 600 }} id="me-color">Avatar color</span>
            <div role="radiogroup" aria-labelledby="me-color" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)}
                  style={{ width: 44, height: 44, borderRadius: '50%', background: c, border: '1.5px solid var(--ink)',
                    boxShadow: c === color ? '0 0 0 3px var(--paper), 0 0 0 4.5px var(--ink)' : 'none' }} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="me-upi">UPI ID for withdrawals</label>
            <div className="input"><input id="me-upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" autoComplete="off" /></div>
            <p className="help">Your phone number can only be changed by the admin.</p>
          </div>
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <button className="btn primary block" disabled={!dirty || busy} style={{ marginTop: 20 }}>
            {busy ? <span className="spinner" aria-label="Saving" /> : <span>Save</span>}
          </button>
        </form>
      </div>

      <div className="list" style={{ marginTop: 8 }}>
        {isAdmin && (
          <Link to="/admin" className="row">
            <span className="ic" style={{ ['--b' as string]: 'var(--lemon)' }}><Icon name="shield" /></span>
            <span><span className="rt">Admin</span><span className="rs">Sign-in codes and members</span></span>
            <Icon name="chev" />
          </Link>
        )}
        <button className="row" onClick={() => signOut('manual')}>
          <span className="ic" style={{ ['--b' as string]: 'var(--bad-bg)', color: 'var(--bad)' }}><Icon name="logout" /></span>
          <span className="rt" style={{ color: 'var(--bad)' }}>Sign out</span>
          <span />
        </button>
      </div>
    </Shell>
  )
}
