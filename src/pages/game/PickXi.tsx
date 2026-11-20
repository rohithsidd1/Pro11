import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { callFunction, errorText } from '../../lib/api'
import { canAutoLoadSquad } from '../../lib/squads'
import { initials, shortTeam, teamColor } from '../../lib/cricket'
import { istTime, untilText } from '../../lib/ist'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MatchPlayer } from '../../lib/types'
import { ROLE_LABEL, ROLE_ORDER, ROLE_PLURAL, useContest, useMatchAndSquad } from '../../lib/useGames'
import { SkScreen } from '../../components/Skeleton'
import { SavedSheet } from '../../components/SavedSheet'

export function PickXi() {
  const { id = '' } = useParams()
  const [saved, setSaved] = useState<{ title: string; detail: string } | null>(null)
  const toast = useToast()
  const { match, players, loading: l1, reload: reloadSquad } = useMatchAndSquad(id)
  const { contest, mine, myPicks, loading: l2, reload } = useContest(id, 'xi')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [team, setTeam] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | null>(null)

  useEffect(() => { if (!dirty) setPicked(new Set(myPicks.map((p) => p.player_id))) }, [myPicks, dirty])
  useEffect(() => { if (match && !team) setTeam(match.team_a) }, [match, team])
  // Squads load by themselves: ask once if allowed, then keep checking until they arrive.
  useEffect(() => {
    if (!match || players.length) return
    if (canAutoLoadSquad(match)) void callFunction('sync-cricket', { mode: 'squad-for-entry', matchId: id }).then(() => reloadSquad()).catch(() => undefined)
    const t = window.setInterval(() => void reloadSquad(), 20000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, players.length])

  const byTeam = useMemo(() => {
    const m = new Map<string, MatchPlayer[]>()
    for (const p of players) m.set(p.team, [...(m.get(p.team) ?? []), p])
    return m
  }, [players])

  if (l1 || l2) return <Shell title="Predict the XI" back={`/match/${id}`}><SkScreen hero={false} rows={8} /></Shell>
  if (!match || !contest) return <Shell title="Predict the XI" back="/"><Empty icon="stumps" title="This game isn’t available" action={<Link className="btn" to="/"><span>Back to matches</span></Link>}>The match may have been removed from the list, or the game wasn’t run.</Empty></Shell>
  if (!mine) return <Navigate to={`/match/${id}`} replace />

  const teams = [match.team_a, match.team_b]
  const open = contest.status === 'open' && new Date(contest.lock_at).getTime() > Date.now()
  const countFor = (t: string) => (byTeam.get(t) ?? []).filter((p) => picked.has(p.player_id)).length
  const total = teams.reduce((s, t) => s + countFor(t), 0)
  const current = team ?? match.team_a
  const list = byTeam.get(current) ?? []
  const full = countFor(current) >= 11

  const toggle = (p: MatchPlayer) => {
    if (!open) return
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(p.player_id)) next.delete(p.player_id)
      else if (countFor(p.team) < 11) next.add(p.player_id)
      return next
    })
    setDirty(true)
  }
  const save = async () => {
    setBusy('save')
    const { error } = await supabase.rpc('save_xi_picks', { p_contest: contest.id, p_players: [...picked] })
    setBusy(null)
    if (error) return toast(errorText(error))
    setDirty(false); await reload()
    setSaved(total === 22 ? { title: 'Picks saved', detail: 'All 22 picked: 11 for each team. Good luck!' } : { title: `${total} of 22 saved`, detail: 'Pick the rest before the toss to score for every player.' })
  }

  return (
    <Shell title="Predict the XI" kicker={open ? `Locks at ${istTime(contest.lock_at)}, in ${untilText(contest.lock_at)}` : 'Locked'} back={`/match/${id}`}
      actions={!open ? <Link className="btn sm" to={`/match/${id}/xi/results`}><Icon name="trophy" small /><span>Results</span></Link> : undefined}>
      <div className="pick-wrap">
      {players.length === 0 ? (
        <Empty icon="user" title="Loading squads from Cricbuzz…">
          This happens by itself as soon as Cricbuzz publishes the squads. You can pick once they’re in.
        </Empty>
      ) : (
        <>
          <div className="seg" role="group" aria-label="Team" style={{ maxWidth: 560 }}>
            {teams.map((t) => (
              <button key={t} aria-pressed={current === t} onClick={() => setTeam(t)}>
                {shortTeam(t)} <span className="num" style={{ fontWeight: 500, fontSize: 12.5 }}>{countFor(t)}/11</span>
              </button>
            ))}
          </div>
          {!open && <p className="help" style={{ marginTop: 12 }}>Picks are locked. This is what you picked.</p>}
          {ROLE_ORDER.map((role) => {
            const group = list.filter((p) => p.role === role)
            if (!group.length) return null
            return (
              <section key={role}>
                <h2 className="role-h"><span>{ROLE_PLURAL[role]}</span><span className="help num">{group.filter((p) => picked.has(p.player_id)).length}/{group.length}</span></h2>
                <div className="list">
                  {group.map((p) => {
                    const on = picked.has(p.player_id)
                    return (
                      <button key={p.player_id} className="prow-btn" aria-pressed={on} disabled={!open || (!on && full)} onClick={() => toggle(p)}>
                        <span className="p-ini" style={{ ['--tc' as string]: teamColor(p.team) }} aria-hidden="true">{initials(p.name)}</span>
                        <span style={{ minWidth: 0 }}><span className="rt">{p.name}</span><span className="rs">{ROLE_LABEL[p.role]}{p.manual ? ', added by admin' : ''}</span></span>
                        <span className="tick" aria-hidden="true"><Icon name={on ? 'check' : 'plus'} /></span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {open && (
            <div className="footbar">
              <div className="footbar-in">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="fk">{dirty ? 'Not saved yet' : 'Saved'}</p>
                  <p className="fv"><span className="num">{total}</span> of <span className="num">22</span></p>
                  <span className="meter" aria-hidden="true"><i style={{ width: `${(total / 22) * 100}%` }} /></span>
                </div>
                <button className="btn primary" disabled={!dirty || busy === 'save'} onClick={save}>
                  {busy === 'save' ? <span className="spinner" /> : <span>Save picks</span>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>
      {saved && <SavedSheet matchId={id} game="xi" title={saved.title} detail={saved.detail} lockAt={contest.lock_at} onClose={() => setSaved(null)} />}
    </Shell>
  )
}
