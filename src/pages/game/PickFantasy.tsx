import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { TeamPreview } from '../../components/TeamPreview'
import { callFunction, errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { initials, shortTeam, teamColor } from '../../lib/cricket'
import { istTime, untilText } from '../../lib/ist'
import { canAutoLoadSquad } from '../../lib/squads'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MatchPlayer } from '../../lib/types'
import { ROLE_LABEL, ROLE_ORDER, ROLE_PLURAL, teamRules, useContest, useMatchAndSquad } from '../../lib/useGames'
import { SkScreen } from '../../components/Skeleton'
import { SavedSheet } from '../../components/SavedSheet'
import { SearchBar, useQuery } from '../../components/SearchBar'
import { roleWords, smartFilter } from '../../lib/search'

type Role = MatchPlayer['role']
const SHORT: Record<Role, string> = { WK: 'WK', BAT: 'BAT', AR: 'AR', BOWL: 'BOWL' }

export function PickFantasy() {
  const { id = '' } = useParams()
  const [fq, setFq] = useQuery(`pickfx.${id}`)
  const [saved, setSaved] = useState<{ title: string; detail: string } | null>(null)
  const toast = useToast()
  const { settings } = useAuth()
  const rules = teamRules(settings)
  const { match, players, loading: l1, reload: reloadSquad } = useMatchAndSquad(id)
  const { contest, mine, myTeam, loading: l2, reload } = useContest(id, 'fantasy')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [cap, setCap] = useState<string | null>(null)
  const [vice, setVice] = useState<string | null>(null)
  const [role, setRole] = useState<Role>('WK')
  const [step, setStep] = useState<'pick' | 'captain' | 'preview'>('pick')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (dirty || !myTeam.length) return
    setSel(new Set(myTeam.map((p) => p.player_id)))
    setCap(myTeam.find((p) => p.captain)?.player_id ?? null)
    setVice(myTeam.find((p) => p.vice)?.player_id ?? null)
    setStep('preview')
  }, [myTeam, dirty])
  useEffect(() => {
    if (!match || players.length) return
    if (canAutoLoadSquad(match)) void callFunction('sync-cricket', { mode: 'squad-for-entry', matchId: id }).then(() => reloadSquad()).catch(() => undefined)
    const t = window.setInterval(() => void reloadSquad(), 20000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, players.length])

  const byId = useMemo(() => new Map(players.map((p) => [p.player_id, p])), [players])
  if (l1 || l2) return <Shell title="Fantasy XI" back={`/match/${id}`}><SkScreen hero={false} rows={8} /></Shell>
  if (!match || !contest) return <Shell title="Fantasy XI" back="/"><Empty icon="stumps" title="This game isn’t available" action={<Link className="btn" to="/"><span>Back to matches</span></Link>}>The match may have been removed from the list, or the game wasn’t run.</Empty></Shell>
  if (!mine) return <Navigate to={`/match/${id}`} replace />

  const open = contest.status === 'open' && new Date(contest.lock_at).getTime() > Date.now()
  const chosen = [...sel].map((pid) => byId.get(pid)).filter(Boolean) as MatchPlayer[]
  const roleCount = (r: Role) => chosen.filter((p) => p.role === r).length
  const sideCount = (t: string) => chosen.filter((p) => p.team === t).length
  const teams = [match.team_a, match.team_b]

  const blockReason = (p: MatchPlayer): string | null => {
    if (sel.has(p.player_id)) return null
    if (sel.size >= 11) return '11 picked'
    if (sideCount(p.team) >= rules.maxPerSide) return `Max ${rules.maxPerSide} from ${shortTeam(p.team)}`
    if (roleCount(p.role) >= rules.roles[p.role][1]) return `Max ${rules.roles[p.role][1]}`
    // keep room for the roles still below their minimum
    const need = ROLE_ORDER.filter((r) => r !== p.role).reduce((n, r) => n + Math.max(0, rules.roles[r][0] - roleCount(r)), 0)
    if (11 - sel.size - 1 < need) return 'Room needed for other roles'
    return null
  }
  const toggle = (p: MatchPlayer) => {
    if (!open) return
    if (!sel.has(p.player_id) && blockReason(p)) return
    setSel((prev) => { const n = new Set(prev); if (n.has(p.player_id)) n.delete(p.player_id); else n.add(p.player_id); return n })
    if (cap === p.player_id) setCap(null)
    if (vice === p.player_id) setVice(null)
    setDirty(true)
  }
  const missing = ROLE_ORDER.filter((r) => roleCount(r) < rules.roles[r][0]).map((r) => `${rules.roles[r][0] - roleCount(r)} more ${ROLE_LABEL[r].toLowerCase()}${rules.roles[r][0] - roleCount(r) > 1 ? 's' : ''}`)
  const teamOk = sel.size === 11 && missing.length === 0
  const save = async () => {
    if (!cap || !vice) return toast('Choose a captain and a vice-captain')
    setBusy(true)
    const { error } = await supabase.rpc('save_fantasy_team', { p_contest: contest.id, p_players: [...sel], p_captain: cap, p_vice: vice })
    setBusy(false)
    if (error) return toast(errorText(error))
    setDirty(false); await reload(); setStep('preview')
    setSaved({ title: 'Team saved', detail: `11 players, with ${byId.get(cap)?.name ?? 'your captain'} as captain (${rules.captain}×) and ${byId.get(vice)?.name ?? 'your vice-captain'} as vice-captain (${rules.vice}×).` })
  }

  const list = fq
    ? smartFilter(players, fq, (p) => [p.name, p.team, roleWords(p.role)])
    : players.filter((p) => p.role === role).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))

  return (
    <Shell title="Fantasy XI" kicker={open ? `Locks at ${istTime(contest.lock_at)}, in ${untilText(contest.lock_at)}` : 'Locked'} back={`/match/${id}`}
      actions={!open ? <Link className="btn sm" to={`/match/${id}/fantasy/results`}><Icon name="trophy" small /><span>Results</span></Link> : undefined}>
      <div className="pick-wrap">
        {players.length === 0 ? (
          <Empty icon="user" title="Loading squads from Cricbuzz…">This happens by itself as soon as Cricbuzz publishes the squads. You can pick once they’re in.</Empty>
        ) : step === 'preview' || (!open && chosen.length === 11) ? (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {teams.map((t) => <span key={t} className="tag"><span className="tx">{shortTeam(t)} {sideCount(t)}</span></span>)}
              <span className="tag ink"><span className="tx">{sel.size} of 11</span></span>
            </div>
            <TeamPreview players={chosen} captain={cap} vice={vice} />
            {open && <button className="btn block" style={{ marginTop: 12 }} onClick={() => setStep('pick')}><span>Edit team</span></button>}
          </>
        ) : step === 'pick' || !open ? (
          <>
            <div className="kv3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div><p className="k">Players</p><p className="v">{sel.size}/11</p></div>
              {teams.map((t) => <div key={t}><p className="k">{shortTeam(t)}</p><p className="v">{sideCount(t)}<span style={{ fontSize: 13, color: 'var(--muted)' }}>/{rules.maxPerSide}</span></p></div>)}
            </div>
            <div className="seg" role="group" aria-label="Role" style={{ marginTop: 12 }}>
              {ROLE_ORDER.map((r) => (
                <button key={r} aria-pressed={role === r} onClick={() => setRole(r)}>
                  {SHORT[r]} <span className="num" style={{ fontWeight: 500, fontSize: 12 }}>{roleCount(r)}</span>
                </button>
              ))}
            </div>
            <div className="search-wrap"><SearchBar value={fq} onChange={setFq} placeholder="Search all players" label="Search players" /></div>
            {fq && <p className="help" style={{ marginTop: 6 }}>Searching every role. Clear the search to pick by role.</p>}
            {!fq && <p className="help" style={{ margin: '10px 0 0' }}>{ROLE_PLURAL[role]}: pick {rules.roles[role][0]}–{rules.roles[role][1]}. Most {rules.maxPerSide} from one team.</p>}
            <div className="list" style={{ marginTop: 10 }}>
              {list.map((p) => {
                const on = sel.has(p.player_id)
                const why = open ? blockReason(p) : null
                return (
                  <button key={p.player_id} className="prow-btn" aria-pressed={on} disabled={!open || (!on && !!why)} onClick={() => toggle(p)}>
                    <span className="p-ini" style={{ ['--tc' as string]: teamColor(p.team) }} aria-hidden="true">{initials(p.name)}</span>
                    <span style={{ minWidth: 0 }}><span className="rt">{p.name}</span>
                      <span className="rs">{shortTeam(p.team)}{fq ? `, ${ROLE_LABEL[p.role]}` : ''}{cap === p.player_id ? ', captain' : vice === p.player_id ? ', vice-captain' : ''}{!on && why ? `, ${why.toLowerCase()}` : ''}</span></span>
                    <span className="tick" aria-hidden="true"><Icon name={on ? 'check' : 'plus'} /></span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <p className="help" style={{ marginBottom: 12 }}>Your captain scores {rules.captain}× points and your vice-captain {rules.vice}×.</p>
            <div className="list">
              {chosen.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((p) => (
                <div key={p.player_id} className="prow-btn" style={{ cursor: 'default' }}>
                  <span className="p-ini" style={{ ['--tc' as string]: teamColor(p.team) }} aria-hidden="true">{initials(p.name)}</span>
                  <span style={{ minWidth: 0 }}><span className="rt">{p.name}</span><span className="rs">{shortTeam(p.team)}, {ROLE_LABEL[p.role]}</span></span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className={`cv${cap === p.player_id ? ' on' : ''}`} aria-pressed={cap === p.player_id} aria-label={`Make ${p.name} captain`}
                      onClick={() => { setCap(p.player_id); if (vice === p.player_id) setVice(null); setDirty(true) }}>C</button>
                    <button className={`cv${vice === p.player_id ? ' on' : ''}`} aria-pressed={vice === p.player_id} aria-label={`Make ${p.name} vice-captain`}
                      onClick={() => { setVice(p.player_id); if (cap === p.player_id) setCap(null); setDirty(true) }}>VC</button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {open && players.length > 0 && step !== 'preview' && (
          <div className="footbar">
            <div className="footbar-in">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="fk">{step === 'captain' ? (cap && vice ? (dirty ? 'Not saved yet' : 'Saved') : 'Pick C and VC') : teamOk ? (dirty ? 'Ready for captains' : 'Saved') : missing[0] ?? `${11 - sel.size} more to pick`}</p>
                <p className="fv"><span className="num">{sel.size}</span> of <span className="num">11</span></p>
              </div>
              {step === 'pick'
                ? <button className="btn primary" disabled={!teamOk} onClick={() => setStep('captain')}><span>Next</span></button>
                : <>
                    <button className="btn sm" onClick={() => setStep('pick')}><span>Back</span></button>
                    <button className="btn primary" disabled={!cap || !vice || busy || !dirty} onClick={save}>{busy ? <span className="spinner" /> : <span>Save team</span>}</button>
                  </>}
            </div>
          </div>
        )}
      </div>
      {saved && <SavedSheet matchId={id} game="fantasy" title={saved.title} detail={saved.detail} lockAt={contest.lock_at} onClose={() => setSaved(null)} />}
    </Shell>
  )
}
