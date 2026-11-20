import { Link } from 'react-router-dom'
import { isLive, scoreFor, scoreText, shortTeam } from '../lib/cricket'
import { istDate, istTime, untilText } from '../lib/ist'
import type { Match } from '../lib/types'
import type { GameInfo } from '../lib/useMatches'
import { TeamBadge } from './TeamBadge'

function statusPills(m: Match): string[] {
  if (m.ended) return [m.status_text || 'Finished']
  if (isLive(m)) {
    const a = scoreFor(m, m.team_a).at(-1)
    const b = scoreFor(m, m.team_b).at(-1)
    const parts = [a && `${m.team_a_short ?? shortTeam(m.team_a)} ${scoreText(a)}`, b && `${m.team_b_short ?? shortTeam(m.team_b)} ${scoreText(b)}`].filter(Boolean) as string[]
    // the score and Cricbuzz's status line ("Baroda need 45 runs in 30 balls"), as both are useful
    const status = (m.status_text ?? '').trim()
    return parts.length ? (status ? [...parts, status] : parts) : [status || 'In play']
  }
  // not live yet: the toss result if Cricbuzz has it, and never "Starts in 0m" once the time has passed
  const s = (m.status_text ?? '').trim()
  const toss = /opt to|won the toss|elected to/i.test(s)
  if (new Date(m.starts_at).getTime() <= Date.now()) return [toss ? s : 'Starting · waiting for the toss']
  return toss ? [s, `Starts in ${untilText(m.starts_at)}`] : [`Starts in ${untilText(m.starts_at)}`]
}

export function MatchCard({ m, color, games }: { m: Match; color: string; games?: GameInfo }) {
  const live = isLive(m)
  const city = (m.venue ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return (
    <li className="card" style={{ ['--c' as string]: `var(--${color})` }}>
      <span className="tab l">{m.label ?? m.format}</span>
      {live ? <span className="tab r"><span className="tag-live">Live</span></span> : <span className="tab r num">{istDate(m.starts_at)}</span>}
      <span className="grip" aria-hidden="true" />
      <Link className="card-link" to={`/match/${m.id}`} aria-label={`${m.team_a} vs ${m.team_b}, ${m.label ?? m.format}`}>
        <div className="card-body">
          <div className="time"><span className="t num">{istTime(m.starts_at)}</span><span className="fmt">{m.format === 'Other' ? 'Match' : m.format}</span></div>
          <div className="teams">
            <div className="team"><TeamBadge team={m.team_a} short={m.team_a_short} img={m.team_a_img} /><span className="tn">{shortTeam(m.team_a)}</span></div>
            <div className="vs"><span className="v">vs</span></div>
            <div className="team"><TeamBadge team={m.team_b} short={m.team_b_short} img={m.team_b_img} /><span className="tn">{shortTeam(m.team_b)}</span></div>
          </div>
          <div className="venue">
            <span className="city">{city.at(-1) ?? ''}</span>
            <span className="ground">{city.length > 1 ? city[0] : ''}</span>
          </div>
        </div>
        <div className="meta">
          {statusPills(m).map((p) => <span key={p} className="m">{p}</span>)}
          {m.is_women && <span className="m">Women</span>}
          {!m.started && !m.ended && !m.has_squad && !m.squad_fetched_at && <span className="m">Squads soon</span>}
          {games && games.xiJoined > 0 && <span className="m">Playing XI: <span className="num">{games.xiJoined}</span> joined</span>}
          {games && games.fxJoined > 0 && <span className="m">Fantasy: <span className="num">{games.fxJoined}</span> joined</span>}
          {games?.mine && <span className="m you">You’re in</span>}
        </div>
      </Link>
    </li>
  )
}
