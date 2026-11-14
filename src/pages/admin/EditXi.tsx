import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { shortTeam } from '../../lib/cricket'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MatchPlayer } from '../../lib/types'
import { ROLE_LABEL, sortPlayers, useMatchAndSquad } from '../../lib/useGames'

export function EditXi() {
  const { id = '' } = useParams()
  const toast = useToast()
  const { match, players, reload } = useMatchAndSquad(id)
  const [team, setTeam] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<MatchPlayer['role']>('BAT')

  const current = team ?? match?.team_a ?? ''
  const list = useMemo(() => sortPlayers(players.filter((p) => p.team === current)), [players, current])
  useEffect(() => { if (!dirty) setSel(new Set(list.filter((p) => p.in_xi).map((p) => p.player_id))) }, [list, dirty])

  if (!match) return <Shell title="Edit Playing XI" back={`/admin/match/${id}`}><p className="help">Loading…</p></Shell>
  const teams = [match.team_a, match.team_b]
  const xiOf = (t: string) => players.filter((p) => p.team === t && p.in_xi).length

  const toggle = (pid: string) => {
    setSel((prev) => { const n = new Set(prev); if (n.has(pid)) n.delete(pid); else if (n.size < 11) n.add(pid); return n })
    setDirty(true)
  }
  const switchTeam = (t: string) => {
    if (dirty && !window.confirm('Switch team without saving?')) return
    setDirty(false); setTeam(t)
  }
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_xi', { p_match: id, p_team: current, p_players: [...sel] })
    setBusy(false)
    if (error) return toast(errorText(error))
    setDirty(false); await reload()
    toast(sel.size === 11 ? `${shortTeam(current)} XI saved` : `Saved ${sel.size} for ${shortTeam(current)}. Scoring needs 11.`)
  }
  const addPlayer = async () => {
    if (!newName.trim()) return
    const { error } = await supabase.rpc('admin_add_player', { p_match: id, p_team: current, p_name: newName.trim(), p_role: newRole })
    if (error) return toast(errorText(error))
    setNewName(''); await reload(); toast('Player added')
  }

  return (
    <Shell title="Edit Playing XI" kicker={`${shortTeam(match.team_a)} vs ${shortTeam(match.team_b)}`} back={`/admin/match/${id}`}>
      <div className="pick-wrap">
      <div className="seg" role="group" aria-label="Team" style={{ maxWidth: 560 }}>
        {teams.map((t) => <button key={t} aria-pressed={current === t} onClick={() => switchTeam(t)}>{shortTeam(t)} <span className="num" style={{ fontWeight: 500, fontSize: 12.5 }}>{t === current ? sel.size : xiOf(t)}/11</span></button>)}
      </div>
      <p className="help" style={{ margin: '12px 0' }}>Tick the 11 who are playing (check Cricbuzz or the broadcast). Predict the XI scores use this list. Saving both teams with 11 scores the game.</p>
      {list.length === 0 ? <Empty icon="user" title="No squad for this team">Fetch squads from Match control, or add players below.</Empty> : (
        <div className="list">
          {list.map((p) => {
            const on = sel.has(p.player_id)
            return (
              <button key={p.player_id} className="prow-btn" aria-pressed={on} disabled={!on && sel.size >= 11} onClick={() => toggle(p.player_id)}>
                <span className="tick" aria-hidden="true"><Icon name={on ? 'check' : 'plus'} /></span>
                <span><span className="rt">{p.name}</span><span className="rs">{ROLE_LABEL[p.role]}{p.manual ? ', added by you' : ''}</span></span>
                <span />
              </button>
            )
          })}
        </div>
      )}
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="ch"><h3>Add a missing player</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
          <div className="input"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Name, ${shortTeam(current)}`} aria-label="Player name" /></div>
          <button className="btn sm" onClick={addPlayer} disabled={!newName.trim()}><Icon name="plus" small /><span>Add</span></button>
        </div>
        <div className="seg sm" role="group" aria-label="Role" style={{ marginTop: 8, maxWidth: 420 }}>
          {(['WK', 'BAT', 'AR', 'BOWL'] as const).map((r) => <button key={r} aria-pressed={newRole === r} onClick={() => setNewRole(r)}>{r}</button>)}
        </div>
      </section>
      <div className="footbar">
        <div className="footbar-in">
          <div style={{ flex: 1 }}><p className="fk">{shortTeam(current)} XI{dirty ? ', not saved' : ''}</p><p className="fv"><span className="num">{sel.size}</span> of <span className="num">11</span></p></div>
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? <span className="spinner" /> : <span>Save XI</span>}</button>
        </div>
      </div>
      </div>
    </Shell>
  )
}
