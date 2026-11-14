import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { TeamBadge } from '../../components/TeamBadge'
import { errorText } from '../../lib/api'
import { shortTeam } from '../../lib/cricket'
import { istDayName, istTime } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { GameKind, Match, MatchPlayer } from '../../lib/types'
import { useContest, useMatchAndSquad } from '../../lib/useGames'

const REASONS = ['Match abandoned', 'No result', 'Something went wrong']

/** Everything here happens on its own. This screen shows where each game is; Cancel and refund is the only emergency button. */
export function MatchControl() {
  const { id = '' } = useParams()
  const { match, players } = useMatchAndSquad(id)
  if (!match) return <Shell title="Game status" back="/admin/matches"><p className="help">Loading…</p></Shell>
  const teams = [match.team_a, match.team_b]
  const xiCount = (t: string) => players.filter((p) => p.team === t && p.in_xi).length
  return (
    <Shell title={`${match.team_a_short ?? shortTeam(match.team_a)} vs ${match.team_b_short ?? shortTeam(match.team_b)}`} kicker="Game status, all automatic" back="/admin/matches"
      actions={<Link className="btn sm" to={`/match/${id}`}><span>Open match</span></Link>}>
      <div className="split-2">
        <div style={{ display: 'grid', gap: 8 }}>
          <GamePanel match={match} players={players} game="xi" />
          <section className="panel">
            <div className="ch"><h3>Teams</h3></div>
            {teams.map((t) => (
              <div key={t} className="read">
                <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TeamBadge team={t} size={28} img={t === match.team_a ? match.team_a_img : match.team_b_img} />{t}</span>
                <span className="v">{players.filter((p) => p.team === t).length} in squad, {xiCount(t)}/11 XI</span>
              </div>
            ))}
          </section>
        </div>
        <GamePanel match={match} players={players} game="fantasy" />
      </div>
    </Shell>
  )
}

function GamePanel({ match, players, game }: { match: Match; players: MatchPlayer[]; game: GameKind }) {
  const toast = useToast()
  const { contest, entries, reload } = useContest(match.id, game)
  const [reason, setReason] = useState(REASONS[0])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<{ fee: string; enabled: boolean; max: string } | null>(null)
  if (!contest) return <section className="panel"><p className="help">Loading…</p></section>
  const editing = edit ?? { fee: String(contest.fee), enabled: contest.enabled, max: String((contest as unknown as { max_players?: number }).max_players ?? 10) }
  const saveGame = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_game', { p_match: match.id, p_game: game, p_fee: Math.max(0, Math.floor(Number(editing.fee) || 0)),
      p_enabled: editing.enabled, p_max_players: Math.max(2, Math.floor(Number(editing.max) || 2)) })
    setBusy(false)
    if (error) return toast(errorText(error))
    toast('Game updated'); setEdit(null); void reload()
  }

  const pot = contest.fee * entries.length
  const payAt = contest.scored_at ? new Date(new Date(contest.scored_at).getTime() + 30 * 60e3).toISOString() : null
  const xiDone = [match.team_a, match.team_b].every((t) => players.filter((p) => p.team === t && p.in_xi).length === 11)
  const scored = ['scored', 'paid'].includes(contest.status)
  const steps: { done: boolean; title: string; sub: string }[] = [
    { done: entries.length > 0, title: entries.length ? `${entries.length} joined, pot ${rupees(pot)}` : 'Waiting for players',
      sub: `Locks ${istDayName(contest.lock_at).toLowerCase()} at ${istTime(contest.lock_at)}. Fewer than 2 by then: cancelled and refunded.` },
    { done: players.length > 0, title: players.length ? `Squads loaded, ${players.length} players` : match.squad_attempted_at ? 'Loading squads…' : 'Squads load when the first person joins',
      sub: 'From CricketData. No squad for the league: it’s removed and games are refunded.' },
    ...(game === 'xi'
      ? [{ done: xiDone, title: xiDone ? 'Playing XI in, game scored' : 'Playing XI', sub: 'From CricketData after the toss, or from the final points. Neither: refunded.' }]
      : [
          { done: Boolean(contest.live_at), title: contest.live_at ? `Live points at ${istTime(contest.live_at)}` : 'Live points around the innings break', sub: 'One update during the match (if on in Game rules).' },
          { done: scored, title: scored ? 'Final points in' : 'Final points when the match ends', sub: 'Abandoned or no result: refunded.' },
        ]),
    { done: contest.status === 'paid', title: contest.status === 'paid' ? 'Paid out' : payAt ? `Pays out at ${istTime(payAt)}` : 'Pays out 30 minutes after final scoring', sub: 'Winner takes the pot; ties split equally.' },
  ]
  const cancel = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_cancel_contest', { p_contest: contest.id, p_reason: reason })
    setBusy(false)
    if (error) return toast(errorText(error))
    toast('Cancelled and refunded'); setCancelOpen(false); void reload()
  }

  return (
    <section className="panel">
      <div className="ch"><h3>{game === 'xi' ? 'Predict the XI' : 'Fantasy XI'}</h3>{contest.status === 'cancelled' && <span className="tag"><span className="tx">Cancelled</span></span>}</div>
      {contest.status === 'cancelled'
        ? <p className="help">{contest.cancel_reason}. Everyone was refunded.</p>
        : (
          <div className="checks">
            {steps.map((st) => (
              <p key={st.title} className={`check ${st.done ? 'ok' : 'warn'}`}>
                <span className="ci"><Icon name={st.done ? 'check' : 'clock'} /></span>
                <span><b>{st.title}</b><br /><span className="help">{st.sub}</span></span>
              </p>
            ))}
          </div>
        )}
      {contest.status === 'open' && (
        <div style={{ marginTop: 14 }}>
          <label className="rule" style={{ cursor: 'pointer' }}><div><p className="k">Open this game</p>{entries.length > 0 && <p className="s">People have joined</p>}</div>
            <input type="checkbox" role="switch" className="switch" checked={editing.enabled} disabled={entries.length > 0} onChange={(e) => setEdit({ ...editing, enabled: e.target.checked })} /></label>
          <div className="rule"><div><p className="k">Entry fee</p>{entries.length > 0 && <p className="s">Fixed once people join</p>}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="help num">₹</span>
              <input className="num-in" type="number" min={0} value={editing.fee} disabled={entries.length > 0} aria-label="Entry fee" onChange={(e) => setEdit({ ...editing, fee: e.target.value })} /></span></div>
          <div className="rule"><p className="k">Most players</p>
            <input className="num-in" type="number" min={2} max={100} value={editing.max} aria-label="Most players" onChange={(e) => setEdit({ ...editing, max: e.target.value })} /></div>
          {edit && <button className="btn sm primary" style={{ marginTop: 10 }} disabled={busy} onClick={saveGame}>{busy ? <span className="spinner" /> : <span>Save game settings</span>}</button>}
        </div>
      )}
      {entries.length > 0 && (
        <div className="list" style={{ marginTop: 14 }}>
          {[...entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((e) => (
            <div key={e.id} className="row" style={{ background: 'var(--sand)' }}>
              <Avatar name={e.who?.name ?? '?'} color={e.who?.color ?? '#C7B6F7'} />
              <span><span className="rt">{e.who?.name}</span><span className="rs">{contest.status === 'open' ? 'Picks hidden until the lock' : e.rank ? `${e.rank}${e.rank === 1 ? 'st' : e.rank === 2 ? 'nd' : e.rank === 3 ? 'rd' : 'th'}` : 'Locked'}</span></span>
              <span className="hist-right">
                {(scored || contest.live_at) && <span className="amt">{Number(e.points)} pts</span>}
                {e.payout > 0 && <span className="tag ok"><span className="tx">Won {rupees(e.payout)}</span></span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {['open', 'locked', 'scored'].includes(contest.status) && entries.length > 0 && (
        cancelOpen ? (
          <div style={{ marginTop: 14 }}>
            <span className="label-s">Emergency only. Everyone sees the reason and gets their entry back.</span>
            <div role="radiogroup" style={{ display: 'grid', gap: 6 }}>
              {REASONS.map((r) => (
                <button key={r} type="button" className="opt" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}>
                  <span className="radio" /><span style={{ fontSize: 14, fontWeight: 600 }}>{r}</span>
                </button>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setCancelOpen(false)}><span>Back</span></button>
              <button className="btn danger" disabled={busy} onClick={cancel}>{busy ? <span className="spinner" /> : <span>Cancel and refund <span className="num">{rupees(pot)}</span></span>}</button>
            </div>
          </div>
        ) : <button className="btn danger sm" style={{ marginTop: 14 }} onClick={() => setCancelOpen(true)}><Icon name="ban" small /><span>Cancel and refund</span></button>
      )}
    </section>
  )
}
