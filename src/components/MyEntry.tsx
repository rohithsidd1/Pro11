import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { istDayName, istTime } from '../lib/ist'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { Contest, Entry, FantasyPick, GameKind, Match, XiPick } from '../lib/types'
import { Icon } from './Icon'

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`

/** Your entry in a game: what you picked, where it stands, what happens next, and the right button for now. */
export function MyEntry({ match, game, contest, mine, entries, myPicks, myTeam, path, onLeave }: {
  match: Match; game: GameKind; contest: Contest; mine: Entry; entries: Entry[]; myPicks: XiPick[]; myTeam: FantasyPick[]; path: string; onLeave: () => void
}) {
  const now = Date.now()
  const open = contest.status === 'open' && new Date(contest.lock_at).getTime() > now
  const live = game === 'fantasy' ? !!contest.live_at && contest.status === 'locked' : false
  const scored = contest.status === 'scored' || contest.status === 'paid'
  const paid = contest.status === 'paid'
  const n = entries.length
  const [names, setNames] = useState<Record<string, string>>({})
  const cap = myTeam.find((p) => p.captain)?.player_id, vice = myTeam.find((p) => p.vice)?.player_id
  useEffect(() => {
    const ids = [cap, vice].filter(Boolean) as string[]
    if (!ids.length) return
    void supabase.from('match_players').select('player_id, name').eq('match_id', match.id).in('player_id', ids)
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p: { player_id: string; name: string }) => [p.player_id, p.name]))))
  }, [match.id, cap, vice])

  const picksDone = game === 'xi' ? myPicks.length === 22 : myTeam.length === 11 && !!cap && !!vice
  const perTeam = (t: string) => myPicks.filter((p) => p.team === t).length
  const net = paid ? mine.payout - contest.fee : 0

  // the journey, ticked off as it happens
  const steps: { t: string; s?: string; done: boolean; now?: boolean }[] = [
    { t: 'Joined', done: true },
    { t: game === 'xi' ? (picksDone ? 'All 22 picked' : `${myPicks.length} of 22 picked`) : picksDone ? 'Team ready' : 'Pick your team', done: picksDone, now: open && !picksDone },
    { t: open ? `Locks ${istDayName(contest.lock_at).toLowerCase()} ${istTime(contest.lock_at)}` : 'Locked', s: open ? (game === 'xi' ? 'at the toss' : 'at the start') : undefined, done: !open, now: open && picksDone },
    game === 'xi'
      ? { t: scored ? `${mine.correct ?? 0} of 22 right` : 'Playing XI announced', s: scored ? undefined : 'scored straight away', done: scored, now: !open && !scored }
      : { t: live || scored ? 'Live points' : 'Points during the match', s: 'updated every minute', done: live || scored, now: !open && !live && !scored },
    { t: paid ? 'Final' : 'Final results', s: paid ? undefined : '30 min after the match', done: paid, now: (game === 'fantasy' && live) || contest.status === 'scored' },
    { t: paid ? (net > 0 ? `Others owe you ${rupees(net)}` : net < 0 ? `You owe ${rupees(-net)}` : 'You broke even') : 'Settle up in Ledger', done: paid && net === 0, now: paid && net !== 0 },
  ]

  return (
    <div className="entry">
      <div className="entry-top">
        <span className="in-pill"><Icon name="check" />You’re in</span>
        {(scored || live) && <span className="entry-rank"><b className="num">{mine.rank ? ord(mine.rank) : '–'}</b> of {n} · <span className="num">{Number(mine.points)}</span> pts</span>}
      </div>

      {game === 'xi' ? (
        <div className="entry-chips">
          {[match.team_a, match.team_b].map((t) => (
            <span key={t} className={`chip ${perTeam(t) === 11 ? 'ok' : ''}`}><span className="num">{perTeam(t)}/11</span> {t}</span>
          ))}
        </div>
      ) : myTeam.length ? (
        <div className="entry-chips">
          <span className="chip ok"><b>C</b> {names[cap ?? ''] ?? '…'}</span>
          <span className="chip ok"><b>VC</b> {names[vice ?? ''] ?? '…'}</span>
          <span className="chip"><span className="num">{myTeam.length}</span> players</span>
        </div>
      ) : null}

      <ol className="journey" aria-label="What happens next">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? 'done' : s.now ? 'now' : ''}>
            <span className="dot" aria-hidden="true">{s.done ? <Icon name="check" small /> : null}</span>
            <span><span className="jt">{s.t}</span>{s.s && <span className="js"> · {s.s}</span>}</span>
          </li>
        ))}
      </ol>

      <div className="btn-row" style={{ marginTop: 12 }}>
        {open && <button className="btn sm" onClick={onLeave}><span>Leave</span></button>}
        {open && (
          <Link className="btn sm primary" to={`/match/${match.id}/${path}`}><Icon name="edit" small />
            <span>{picksDone ? (game === 'xi' ? 'Edit picks' : 'Edit team') : game === 'xi' ? `Finish picks (${22 - myPicks.length} left)` : 'Pick your team'}</span></Link>
        )}
        {!open && !scored && !live && <Link className="btn sm primary" to={`/match/${match.id}/${path}/results`}><Icon name="user" small /><span>See everyone’s {game === 'xi' ? 'picks' : 'teams'}</span></Link>}
        {!open && (live || scored) && <Link className="btn sm primary" to={`/match/${match.id}/${path}/results`}><Icon name="trophy" small /><span>{paid ? 'Results' : 'Live leaderboard'}</span></Link>}
        {paid && net !== 0 && <Link className="btn sm" to="/ledger"><Icon name="wallet" small /><span>Ledger</span></Link>}
      </div>
    </div>
  )
}
