import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { callFunction, errorText } from '../lib/api'
import { useAuth } from '../lib/auth'
import { istTime } from '../lib/ist'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { Match } from '../lib/types'
import { contestSummary, useContest } from '../lib/useGames'
import { useWallet } from '../lib/useWallet'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

export function XiGameCard({ match }: { match: Match }) {
  const { settings } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { contest, entries, mine, myPicks, loading, reload } = useContest(match.id, 'xi')
  const { balance } = useWallet()
  const [busy, setBusy] = useState(false)
  const minPlayers = (settings as unknown as { min_players?: number })?.min_players ?? 2
  if (loading || !contest) return <li className="card game" style={{ ['--c' as string]: 'var(--blue)' }}><p className="help">Loading…</p></li>
  if (!contest.enabled) return null

  const { pot, line } = contestSummary(contest, entries.length, minPlayers)
  const open = contest.status === 'open' && new Date(contest.lock_at).getTime() > Date.now()
  const short = Math.max(0, contest.fee - balance)

  const join = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('join_contest', { p_match: match.id, p_game: 'xi' })
    if (error) { setBusy(false); return toast(errorText(error)) }
    if (!match.squad_fetched_at) { try { await callFunction('sync-cricket', { mode: 'squad-for-entry', matchId: match.id }) } catch { /* the pick screen retries */ } }
    setBusy(false)
    toast(`You’re in. ${rupees(contest.fee)} taken from your wallet.`)
    navigate(`/match/${match.id}/xi`)
  }
  const leave = async () => {
    if (!window.confirm(`Leave this game? ${rupees(contest.fee)} goes back to your wallet.`)) return
    const { error } = await supabase.rpc('leave_contest', { p_contest: contest.id })
    if (error) return toast(errorText(error))
    toast('You left. Your entry is back in your wallet.'); void reload()
  }

  return (
    <li className="card game" style={{ ['--c' as string]: 'var(--blue)' }}>
      <span className="tab l">Game <span className="num">1</span></span>
      <span className="tab r">{open ? <>Locks <span className="num">{istTime(contest.lock_at)}</span></> : contest.status === 'cancelled' ? 'Cancelled' : 'Locked'}</span>
      <span className="grip" aria-hidden="true" />
      <h3>Predict the Playing XI</h3>
      <p className="desc">Pick 11 from each squad before the toss. A point for every player you get right, and a bonus for a perfect side.</p>
      <dl className="stats">
        <div><dt>Entry</dt><dd>{rupees(contest.fee)}</dd></div>
        <div><dt>Joined</dt><dd className="faces">
          {entries.length === 0 ? <span className="num">0</span> : entries.slice(0, 4).map((e) => <Avatar key={e.id} name={e.who?.name ?? '?'} color={e.who?.color ?? '#C7B6F7'} />)}
          {entries.length > 4 && <span className="more">+{entries.length - 4}</span>}
        </dd></div>
        <div><dt>Pot</dt><dd>{rupees(pot)}</dd></div>
      </dl>

      {open && !mine && (
        <>
          <p className="needs">{line}</p>
          {short > 0
            ? <Link className="btn primary block" style={{ marginTop: 12 }} to={`/wallet/add?amount=${Math.max(short, 10)}`}><Icon name="down" /><span>Add {rupees(short)} to join</span></Link>
            : <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={join}>{busy ? <span className="spinner" /> : <span>Join for <span className="num">{rupees(contest.fee)}</span></span>}</button>}
        </>
      )}
      {open && mine && (
        <div className="game-foot">
          <span className="in-pill"><Icon name="check" />You’re in, <span className="num">{myPicks.length}</span>/22 picked</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={leave}><span>Leave</span></button>
            <Link className="btn sm primary" to={`/match/${match.id}/xi`}><Icon name="edit" small /><span>{myPicks.length ? 'Edit picks' : 'Pick now'}</span></Link>
          </span>
        </div>
      )}
      {!open && contest.status !== 'cancelled' && (
        <div className="game-foot">
          <span className="help" style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {mine && contest.status !== 'locked' ? <>You: <span className="num">{mine.correct}</span>/22, rank <span className="num">{mine.rank ?? '–'}</span>{mine.payout > 0 && <>, won <span className="num">{rupees(mine.payout)}</span></>}</> : line}
          </span>
          {entries.length > 0 && <Link className="btn sm" to={`/match/${match.id}/xi/results`}><Icon name="trophy" small /><span>{contest.status === 'locked' ? 'See all picks' : 'Results'}</span></Link>}
        </div>
      )}
      {contest.status === 'cancelled' && <p className="needs">{line}{mine ? '. Your entry was refunded.' : ''}</p>}
    </li>
  )
}
