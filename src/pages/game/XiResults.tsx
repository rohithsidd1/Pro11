import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { useAuth } from '../../lib/auth'
import { shortTeam } from '../../lib/cricket'
import { istTime } from '../../lib/ist'
import { rupees } from '../../lib/money'
import type { MatchPlayer } from '../../lib/types'
import { sortPlayers, useContest, useMatchAndSquad } from '../../lib/useGames'

export function XiResults() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const { match, players, loading: l1 } = useMatchAndSquad(id)
  const { contest, entries, picks, mine, loading: l2 } = useContest(id, 'xi')
  const [who, setWho] = useState<string | null>(null)
  const [team, setTeam] = useState<string | null>(null)

  const xiKnown = useMemo(() => {
    const teams = new Map<string, number>()
    for (const p of players) if (p.in_xi) teams.set(p.team, (teams.get(p.team) ?? 0) + 1)
    return teams.size === 2 && [...teams.values()].every((n) => n === 11)
  }, [players])

  if (l1 || l2) return <Shell title="Results" back={`/match/${id}`}><p className="help">Loading…</p></Shell>
  if (!match || !contest) return <Shell title="Results" back="/"><Empty icon="trophy" title="Game not found" /></Shell>
  if (contest.status === 'open') return <Navigate to={mine ? `/match/${id}/xi` : `/match/${id}`} replace />

  const ranked = [...entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.points - a.points)
  const pot = contest.fee * entries.length
  const final = contest.status === 'paid'
  const leader = ranked[0]
  const viewing = entries.find((e) => e.id === (who ?? mine?.id ?? ranked[0]?.id)) ?? null
  const viewPicks = new Set(picks.filter((p) => p.entry_id === viewing?.id).map((p) => p.player_id))
  const teams = [match.team_a, match.team_b]
  const currentTeam = team ?? match.team_a
  const teamPlayers = sortPlayers(players.filter((p) => p.team === currentTeam))
  const isMe = viewing?.user_id === profile?.id

  const rows = teamPlayers
    .map((p) => {
      const picked = viewPicks.has(p.player_id)
      if (xiKnown) {
        if (picked && p.in_xi) return { p, kind: 'ok' as const, text: 'Picked, in the XI' }
        if (picked && !p.in_xi) return { p, kind: 'bad' as const, text: isMe ? 'You picked him, not in the XI' : 'Picked, not in the XI' }
        if (!picked && p.in_xi) return { p, kind: 'warn' as const, text: isMe ? 'In the XI, you didn’t pick him' : 'In the XI, not picked' }
        return null
      }
      return picked ? { p, kind: 'ok' as const, text: 'Picked' } : null
    })
    .filter(Boolean) as { p: MatchPlayer; kind: 'ok' | 'bad' | 'warn'; text: string }[]
  const order = { ok: 0, warn: 1, bad: 2 }
  rows.sort((a, b) => order[a.kind] - order[b.kind])
  const teamCorrect = (t: string) => players.filter((p) => p.team === t && p.in_xi && viewPicks.has(p.player_id)).length

  return (
    <Shell title="Predict the XI" kicker={`${shortTeam(match.team_a)} vs ${shortTeam(match.team_b)}, results`} back={`/match/${id}`}>
      <div className="split-2">
        <div>
          <section className="chead" style={{ ['--c' as string]: 'var(--blue)', paddingBottom: 20 }}>
            {contest.status === 'locked' && !xiKnown ? (
              <div className="score-hero">
                <p className="h1" style={{ fontSize: 26 }}>Waiting for the Playing XI</p>
                <p className="lead" style={{ color: 'var(--ink)' }}>Picks locked at <span className="num">{istTime(contest.lock_at)}</span>. Scores appear once both XIs are confirmed.</p>
              </div>
            ) : (
              <div className="score-hero">
                <p style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700 }}>
                  {mine ? (mine.rank === 1 ? (final ? 'You won' : 'You’re 1st') : `You’re ${ordinal(mine.rank ?? 0)}`) : `${leader?.who?.name ?? ''} leads`}
                </p>
                <p className="big">{mine ? mine.correct : leader?.correct ?? 0}<span style={{ fontSize: 22, fontWeight: 500 }}>/22</span></p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>
                  <span className="num">{mine ? mine.points : leader?.points ?? 0}</span> points
                  {mine && leader && mine.id !== leader.id && <>, <span className="num">{Number(leader.points) - Number(mine.points)}</span> behind {leader.who?.name.split(' ')[0]}</>}
                </p>
              </div>
            )}
            <div className="kv3" style={{ marginTop: 16 }}>
              <div><p className="k">Pot</p><p className="v">{rupees(pot)}</p></div>
              <div><p className="k">Players</p><p className="v">{entries.length}</p></div>
              <div><p className="k">Status</p><p className="v" style={{ fontSize: 15, fontFamily: 'var(--text)', fontWeight: 700 }}>{final ? 'Final' : contest.status === 'scored' ? 'Provisional' : 'Locked'}</p></div>
            </div>
          </section>

          <div className="sec"><h2>Standings</h2><span className="aside">{contestRule(contest.fee, final)}</span></div>
          <div className="list">
            {ranked.map((e) => (
              <button key={e.id} className={`rank-row${e.user_id === profile?.id ? ' me' : ''}`} aria-pressed={viewing?.id === e.id} onClick={() => setWho(e.id)}>
                <span className="pos">{contest.status === 'locked' ? '–' : e.rank}</span>
                <Avatar name={e.who?.name ?? '?'} color={e.who?.color ?? '#C7B6F7'} />
                <span style={{ minWidth: 0 }}>
                  <span className="rt">{e.user_id === profile?.id ? 'You' : e.who?.name}</span>
                  <span className="rs">{contest.status === 'locked' ? `${picks.filter((p) => p.entry_id === e.id).length} picks` : `${e.correct} of 22 right`}{e.payout > 0 && <>, won <span className="num">{rupees(e.payout)}</span></>}</span>
                </span>
                <span className="pts">{contest.status === 'locked' ? '' : e.points}</span>
              </button>
            ))}
          </div>
          <p className="fine" style={{ paddingLeft: 0 }}>{final ? 'Final. Winnings are in the winners’ wallets.' : 'Provisional until the admin finishes the game and pays out.'} Tap anyone to see their picks.</p>
        </div>

        <div>
          <div className="sec" style={{ paddingTop: 0 }}>
            <h2>{isMe ? 'Your picks' : `${viewing?.who?.name.split(' ')[0] ?? ''}’s picks`}{xiKnown ? ' vs the XI' : ''}</h2>
          </div>
          <div className="seg" role="group" aria-label="Team">
            {teams.map((t) => (
              <button key={t} aria-pressed={currentTeam === t} onClick={() => setTeam(t)}>
                {shortTeam(t)} {xiKnown && <span className="num" style={{ fontWeight: 500, fontSize: 12.5 }}>{teamCorrect(t)}/11</span>}
              </button>
            ))}
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {rows.length === 0 && <p className="help">No picks for this team.</p>}
            {rows.map(({ p, kind, text }) => (
              <div key={p.player_id} className={`mark ${kind}`}>
                <span className="ci"><Icon name={kind === 'ok' ? 'check' : kind === 'bad' ? 'x' : 'alert'} /></span>
                <span style={{ minWidth: 0 }}><span className="rt" style={{ fontSize: 14.5 }}>{p.name}</span><span className="rs">{text}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
function contestRule(fee: number, final: boolean) {
  return fee > 0 ? (final ? 'Paid out' : 'Winner takes all') : 'Just for fun'
}
