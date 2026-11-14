import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Empty } from '../../components/Empty'
import { Shell } from '../../components/Shell'
import { useAuth } from '../../lib/auth'
import { shortTeam } from '../../lib/cricket'
import { istTime } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { ROLE_LABEL, ROLE_ORDER, teamRules, useContest, useMatchAndSquad, usePlayerPoints } from '../../lib/useGames'

const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function FantasyResults() {
  const { id = '' } = useParams()
  const { profile, settings } = useAuth()
  const rules = teamRules(settings)
  const { match, players, loading: l1 } = useMatchAndSquad(id)
  const { contest, entries, team, mine, loading: l2 } = useContest(id, 'fantasy')
  const points = usePlayerPoints(id)
  const [who, setWho] = useState<string | null>(null)
  const [cmp, setCmp] = useState<string | null>(null)

  if (l1 || l2) return <Shell title="Results" back={`/match/${id}`}><p className="help">Loading…</p></Shell>
  if (!match || !contest) return <Shell title="Results" back="/"><Empty icon="trophy" title="Game not found" /></Shell>
  if (contest.status === 'open') return <Navigate to={mine ? `/match/${id}/fantasy` : `/match/${id}`} replace />

  const ranked = [...entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || Number(b.points) - Number(a.points))
  const leader = ranked[0]
  const final = contest.status === 'paid' || contest.status === 'scored'
  const hasPoints = points.size > 0
  const viewing = entries.find((e) => e.id === (who ?? mine?.id ?? ranked[0]?.id)) ?? null
  const vTeam = team.filter((p) => p.entry_id === viewing?.id)
  const byId = new Map(players.map((p) => [p.player_id, p]))
  const lastUpdate = [...points.values()].reduce((t, p) => (p.updated_at > t ? p.updated_at : t), '')
  const isMe = viewing?.user_id === profile?.id

  return (
    <Shell title="Fantasy XI" kicker={`${shortTeam(match.team_a)} vs ${shortTeam(match.team_b)}, ${final ? 'results' : 'live'}`} back={`/match/${id}`}>
      <div className="split-2">
        <div>
          <section className="chead" style={{ ['--c' as string]: 'var(--coral)', paddingBottom: 20 }}>
            {!hasPoints ? (
              <div className="score-hero">
                <p className="h1" style={{ fontSize: 26 }}>Teams are locked</p>
                <p className="lead" style={{ color: 'var(--ink)' }}>Points arrive from CricketData during the match (around the innings break) and at the end.</p>
              </div>
            ) : (
              <div className="score-hero">
                <p style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700 }}>
                  {mine ? (mine.rank === 1 ? (contest.status === 'paid' ? 'You won' : 'You’re 1st') : `You’re ${ordinal(mine.rank ?? 0)}`) : `${leader?.who?.name ?? ''} leads`}
                </p>
                <p className="big">{fmt(Number(mine ? mine.points : leader?.points ?? 0))}</p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>points{mine && leader && mine.id !== leader.id && <>, <span className="num">{fmt(Number(leader.points) - Number(mine.points))}</span> behind {leader.who?.name.split(' ')[0]}</>}</p>
              </div>
            )}
            <div className="kv3" style={{ marginTop: 16 }}>
              <div><p className="k">Pot</p><p className="v">{rupees(contest.fee * entries.length)}</p></div>
              <div><p className="k">Players</p><p className="v">{entries.length}</p></div>
              <div><p className="k">Status</p><p className="v" style={{ fontSize: 15, fontFamily: 'var(--text)', fontWeight: 700 }}>
                {contest.status === 'paid' ? 'Final' : contest.status === 'scored' ? 'Final, paying soon' : hasPoints ? `Live, ${istTime(lastUpdate)}` : 'Locked'}</p></div>
            </div>
          </section>

          <div className="sec"><h2>Standings</h2><span className="aside">Winner takes all</span></div>
          <div className="list">
            {ranked.map((e) => (
              <button key={e.id} className={`rank-row${e.user_id === profile?.id ? ' me' : ''}`} aria-pressed={viewing?.id === e.id} onClick={() => setWho(e.id)}>
                <span className="pos">{hasPoints ? e.rank : '–'}</span>
                <Avatar name={e.who?.name ?? '?'} color={e.who?.color ?? '#C7B6F7'} />
                <span style={{ minWidth: 0 }}>
                  <span className="rt">{e.user_id === profile?.id ? 'You' : e.who?.name}</span>
                  <span className="rs">{e.payout > 0 ? <>Won <span className="num">{rupees(e.payout)}</span></> : 'Tap to see the team'}</span>
                </span>
                <span className="pts">{hasPoints ? fmt(Number(e.points)) : ''}</span>
              </button>
            ))}
          </div>
          <p className="fine" style={{ paddingLeft: 0 }}>{contest.status === 'paid' ? 'Final. Winnings are in the winners’ wallets.' : 'Points update automatically. The final points pay out 30 minutes after they arrive.'}</p>
        </div>

        <div>
          {mine && entries.length > 1 && (
            <Compare mineId={mine.id} otherId={cmp ?? ranked.find((e) => e.id !== mine.id)?.id ?? null} setOther={setCmp} entries={entries} team={team} points={points} names={byId} mult={rules} />
          )}
          <div className="sec" style={{ paddingTop: mine && entries.length > 1 ? undefined : 0 }}><h2>{isMe ? 'Your team' : `${viewing?.who?.name.split(' ')[0] ?? ''}’s team`}</h2></div>
          <div className="list">
            {vTeam.length === 0 && <p className="help">No team saved.</p>}
            {[...vTeam].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((p) => {
              const base = Number(points.get(p.player_id)?.points ?? 0)
              const mult = p.captain ? rules.captain : p.vice ? rules.vice : 1
              return (
                <div key={p.player_id} className="mark ok" style={{ gridTemplateColumns: '1fr auto' }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="rt" style={{ fontSize: 14.5 }}>{byId.get(p.player_id)?.name ?? p.player_id}{p.captain && <span className="cbadge">C</span>}{p.vice && <span className="cbadge">VC</span>}</span>
                    <span className="rs">{shortTeam(p.team)}, {ROLE_LABEL[p.role]}{mult > 1 && hasPoints ? `, ${fmt(base)} × ${mult}` : ''}</span>
                    {hasPoints && <Split pp={points.get(p.player_id)} />}
                  </span>
                  <span className="pts" style={{ fontSize: 17 }}>{hasPoints ? fmt(base * mult) : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function Compare({ mineId, otherId, setOther, entries, team, points, names, mult }: {
  mineId: string; otherId: string | null; setOther: (id: string) => void
  entries: import('../../lib/types').Entry[]; team: import('../../lib/types').FantasyPick[]
  points: Map<string, import('../../lib/types').PlayerPoints>; names: Map<string, import('../../lib/types').MatchPlayer>; mult: { captain: number; vice: number }
}) {
  const others = entries.filter((e) => e.id !== mineId)
  const other = entries.find((e) => e.id === otherId)
  const mine = entries.find((e) => e.id === mineId)
  if (!other || !mine) return null
  const a = team.filter((p) => p.entry_id === mineId), b = team.filter((p) => p.entry_id === other.id)
  const val = (p: import('../../lib/types').FantasyPick) => Number(points.get(p.player_id)?.points ?? 0) * (p.captain ? mult.captain : p.vice ? mult.vice : 1)
  const bIds = new Set(b.map((p) => p.player_id)), aIds = new Set(a.map((p) => p.player_id))
  const onlyA = a.filter((p) => !bIds.has(p.player_id)).sort((x, y) => val(y) - val(x))
  const onlyB = b.filter((p) => !aIds.has(p.player_id)).sort((x, y) => val(y) - val(x))
  const common = a.filter((p) => bIds.has(p.player_id)).length
  const cap = (list: typeof a, k: 'captain' | 'vice') => list.find((p) => p[k])
  const nm = (p?: import('../../lib/types').FantasyPick) => (p ? names.get(p.player_id)?.name ?? p.player_id : '—')
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return (
    <section className="panel" style={{ marginBottom: 8 }}>
      <div className="ch"><h3>Compare teams</h3><span className="help num">{common} players in common</span></div>
      {others.length > 1 && (
        <div className="seg sm" role="group" aria-label="Compare with" style={{ marginBottom: 10 }}>
          {others.map((e) => <button key={e.id} aria-pressed={e.id === other.id} onClick={() => setOther(e.id)}>{e.who?.name.split(' ')[0]}</button>)}
        </div>
      )}
      <div className="cmp">
        <div className="col"><p className="rs" style={{ marginTop: 0 }}>You</p><p className="pts" style={{ textAlign: 'left' }}>{fmt(Number(mine.points))}</p>
          <p className="help" style={{ color: 'var(--ink)' }}>C {nm(cap(a, 'captain'))}<br />VC {nm(cap(a, 'vice'))}</p></div>
        <div className="col"><p className="rs" style={{ marginTop: 0 }}>{other.who?.name.split(' ')[0]}</p><p className="pts" style={{ textAlign: 'left' }}>{fmt(Number(other.points))}</p>
          <p className="help" style={{ color: 'var(--ink)' }}>C {nm(cap(b, 'captain'))}<br />VC {nm(cap(b, 'vice'))}</p></div>
      </div>
      <div className="cmp" style={{ marginTop: 8 }}>
        <div className="col"><p className="k" style={{ fontSize: 12, fontWeight: 700 }}>Only you</p>{onlyA.map((p) => <div key={p.player_id} className="read" style={{ minHeight: 36 }}><span className="k">{nm(p)}</span><span className="v">{fmt(val(p))}</span></div>)}</div>
        <div className="col"><p className="k" style={{ fontSize: 12, fontWeight: 700 }}>Only {other.who?.name.split(' ')[0]}</p>{onlyB.map((p) => <div key={p.player_id} className="read" style={{ minHeight: 36 }}><span className="k">{nm(p)}</span><span className="v">{fmt(val(p))}</span></div>)}</div>
      </div>
    </section>
  )
}

/** Where a player's points came from: batting, bowling, fielding (from CricketData's fantasy points). */
function Split({ pp }: { pp?: import('../../lib/types').PlayerPoints }) {
  if (!pp) return <span className="rs">Didn’t score yet</span>
  const parts = [['Bat', pp.bat], ['Bowl', pp.bowl], ['Field', pp.field]].filter(([, v]) => Number(v)) as [string, number][]
  const rest = Number(pp.points) - parts.reduce((n, [, v]) => n + Number(v), 0)
  if (rest) parts.push(['Other', rest])
  if (!parts.length) return null
  return <span className="split">{parts.map(([k, v]) => <span key={k} className="split-i"><b>{k}</b> {fmt(Number(v))}</span>)}</span>
}
