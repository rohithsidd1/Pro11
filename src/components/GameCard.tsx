import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { callFunction, errorText } from '../lib/api'
import { useAuth } from '../lib/auth'
import { istTime } from '../lib/ist'
import { rupees } from '../lib/money'
import { canAutoLoadSquad } from '../lib/squads'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { GameKind, Match } from '../lib/types'
import { contestSummary, useContest } from '../lib/useGames'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { MyEntry } from './MyEntry'
import { Sk } from './Skeleton'

const GAME: Record<GameKind, { n: number; color: string; title: string; desc: string; path: string }> = {
  xi: { n: 1, color: 'var(--blue)', title: 'Predict the Playing XI', path: 'xi',
    desc: 'Pick 11 from each squad before the toss. A point for every player you get right, and a bonus for a perfect side.' },
  fantasy: { n: 2, color: 'var(--coral)', title: 'Fantasy XI', path: 'fantasy',
    desc: 'Pick 11 players, a captain (2×) and a vice-captain (1.5×). Points come in during and after the match.' },
}


export function GameCard({ match, game }: { match: Match; game: GameKind }) {
  const { settings } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { contest, entries, mine, myPicks, myTeam, loading, reload } = useContest(match.id, game)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [squadsOut, setSquadsOut] = useState<boolean | null>(null)
  useEffect(() => {
    if (match.has_squad || match.squad_fetched_at) { setSquadsOut(true); return }
    void supabase.rpc('squads_ready', { p_match: match.id }).then(({ data }) => setSquadsOut(Boolean(data)))
  }, [match.id, match.has_squad, match.squad_fetched_at])
  const g = GAME[game]
  const minPlayers = (settings as unknown as { min_players?: number })?.min_players ?? 2
  if (loading || !contest) return <li className="card game" style={{ ['--c' as string]: g.color }}><Sk w="40%" h={22} /><Sk w="85%" h={13} style={{ marginTop: 12 }} /><Sk w="100%" h={56} r={14} style={{ marginTop: 14 }} /></li>
  if (!contest.enabled) return null

  const { pot, line } = contestSummary(contest, entries.length, minPlayers)
  const open = contest.status === 'open' && new Date(contest.lock_at).getTime() > Date.now()

  const join = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('join_contest', { p_match: match.id, p_game: game })
    if (error) { setBusy(false); return toast(errorText(error)) }
    if (canAutoLoadSquad(match)) { try { await callFunction('sync-cricket', { mode: 'squad-for-entry', matchId: match.id }) } catch { /* the pick screen keeps checking */ } }
    setBusy(false)
    toast(`You’re in. Now pick your ${game === 'xi' ? 'Playing XIs' : 'team'}.`)
    navigate(`/match/${match.id}/${g.path}`)
  }
  const leave = async () => {
    if (!window.confirm('Leave this game? Your picks will be removed.')) return
    const { error } = await supabase.rpc('leave_contest', { p_contest: contest.id })
    if (error) return toast(errorText(error))
    toast('You left the game.'); void reload()
  }

  const lockedLine = line   // joined games are shown by "Your entry"

  return (
    <li className="card game" style={{ ['--c' as string]: g.color }}>
      <span className="tab l">Game <span className="num">{g.n}</span></span>
      <span className="tab r">{open ? <>Locks <span className="num">{istTime(contest.lock_at)}</span></> : contest.status === 'cancelled' ? 'Cancelled' : contest.status === 'paid' ? 'Final' : 'Locked'}</span>
      <span className="grip" aria-hidden="true" />
      <h3>{g.title}</h3>
      <p className="desc">{g.desc}</p>
      <dl className="stats">
        <div><dt>Entry</dt><dd>{rupees(contest.fee)}</dd></div>
        <div><dt>Joined</dt><dd className="faces">
          {entries.length === 0 ? <span className="num">0</span> : entries.slice(0, 4).map((e) => <Avatar key={e.id} name={e.who?.name ?? '?'} color={e.who?.color ?? '#C7B6F7'} />)}
          {entries.length > 4 && <span className="more">+{entries.length - 4}</span>}
        </dd></div>
        <div><dt>Pot</dt><dd>{rupees(pot)}</dd></div>
      </dl>

      {open && !mine && squadsOut === false && (
        <p className="needs">Games open once the squads are announced. Check back closer to the match.</p>
      )}
      {open && !mine && squadsOut !== false && (
        <>
          <p className="needs">{line}</p>
          {confirming ? (
            <div className="panel" style={{ marginTop: 12, background: 'var(--paper)' }}>
              <p className="rt">Join for {rupees(contest.fee)}?</p>
              <p className="rs">No money moves now. If you lose, you owe the winner {rupees(contest.fee)}; if you win, everyone else owes you. Settle up in Ledger after the match.</p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={() => setConfirming(false)}><span>Cancel</span></button>
                <button className="btn sm primary" disabled={busy} onClick={join}>{busy ? <span className="spinner" /> : <span>Join</span>}</button>
              </div>
            </div>
          ) : <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setConfirming(true)}><span>Join for <span className="num">{rupees(contest.fee)}</span></span></button>}
        </>
      )}
      {mine && contest.status !== 'cancelled' && (
        <MyEntry match={match} game={game} contest={contest} mine={mine} entries={entries} myPicks={myPicks} myTeam={myTeam} path={g.path} onLeave={leave} />
      )}
      {!mine && !open && contest.status !== 'cancelled' && (
        <div className="game-foot">
          <span className="help" style={{ color: 'var(--ink)', fontWeight: 600 }}>{lockedLine}</span>
          {entries.length > 0 && <Link className="btn sm" to={`/match/${match.id}/${g.path}/results`}><Icon name="trophy" small /><span>{contest.status === 'locked' && !contest.live_at ? 'See teams' : 'Results'}</span></Link>}
        </div>
      )}
      {contest.status === 'cancelled' && <p className="needs">{line}{mine ? '. Nobody owes anything for it.' : ''}</p>}
    </li>
  )
}
