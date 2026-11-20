import { useEffect, useRef, useState } from 'react'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { TeamBadge } from '../../components/TeamBadge'
import { errorText } from '../../lib/api'
import { flagFor } from '../../lib/cricket'
import { supabase } from '../../lib/supabase'
import { clearTeamCache } from '../../lib/teams'
import { useToast } from '../../lib/toast'
import { SkRows } from '../../components/Skeleton'

interface Team { key: string; name: string; short_name: string | null; img: string | null; custom_img: string | null }

/** Upload a logo for any team. National teams already have flags. */
export function TeamBadges() {
  const toast = useToast()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<Team | null>(null)
  const load = () => supabase.from('teams').select('key, name, short_name, img, custom_img').order('name').then(({ data }) => setTeams((data as Team[] | null) ?? []))
  useEffect(() => { void load() }, [])

  const upload = async (file: File | undefined) => {
    const t = target.current
    if (!file || !t) return
    if (file.size > 1048576) return toast('Use an image under 1 MB')
    setBusy(t.key)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z]/g, '') || 'png'
    const path = `${t.key.replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('team-badges').upload(path, file, { contentType: file.type, upsert: true })
    if (error) { setBusy(null); return toast('Upload failed') }
    const url = supabase.storage.from('team-badges').getPublicUrl(path).data.publicUrl
    const { error: e2 } = await supabase.rpc('admin_set_team_badge', { p_key: t.key, p_url: url })
    setBusy(null)
    if (e2) return toast(errorText(e2))
    clearTeamCache(); toast(`${t.name} badge updated`); void load()
  }
  const reset = async (t: Team) => {
    const { error } = await supabase.rpc('admin_set_team_badge', { p_key: t.key, p_url: '' })
    if (error) return toast(errorText(error))
    clearTeamCache(); toast('Back to the default'); void load()
  }
  const list = (teams ?? []).filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Shell title="Team badges" back="/admin">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      <div className="input" style={{ maxWidth: 420 }}><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team" aria-label="Find a team" /></div>
      <p className="help" style={{ margin: '10px 0' }}>Teams appear here once they’re in a match. Use your own images (square, under 1 MB). National teams show their flag.</p>
      {teams === null && <SkRows n={6} />}
      {teams !== null && list.length === 0 && <Empty icon="image" title="No teams yet" />}
      <div className="list" style={{ maxWidth: 720 }}>
        {list.map((t) => (
          <div key={t.key} className="row" style={{ gridTemplateColumns: '48px 1fr auto' }}>
            <TeamBadge team={t.name} short={t.short_name} img={t.custom_img ?? t.img} size={44} />
            <span style={{ minWidth: 0 }}><span className="rt">{t.name}</span><span className="rs">{flagFor(t.name) ? 'Flag' : t.custom_img ? 'Your upload' : t.img ? 'From Cricbuzz' : 'Initials'}</span></span>
            <span style={{ display: 'flex', gap: 6 }}>
              {t.custom_img && <button className="btn sm" onClick={() => reset(t)}><span>Reset</span></button>}
              {!flagFor(t.name) && <button className="btn sm" disabled={busy === t.key} onClick={() => { target.current = t; input.current?.click() }}>{busy === t.key ? <span className="spinner" /> : <><Icon name="upload" small /><span>Upload</span></>}</button>}
            </span>
          </div>
        ))}
      </div>
    </Shell>
  )
}
