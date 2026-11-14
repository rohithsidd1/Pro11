import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { TeamBadge } from '../../components/TeamBadge'
import { callFunction, errorText } from '../../lib/api'
import { shortTeam } from '../../lib/cricket'
import { istDayName, istTime } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { useContest, useMatchAndSquad } from '../../lib/useGames'

const REASONS = ['Match abandoned', 'No result', 'Bad data', 'Not enough players']
const STATUS: Record<string, [string, string]> = {
  open: ['Open', 'tag ok'], locked: ['Locked, needs the XI', 'tag warn'], scored: ['Scored, ready to pay', 'tag warn'],
  paid: ['Paid out', 'tag ink'], cancelled: ['Cancelled', 'tag'],
}

export function MatchControl() {
  const { id = '' } = useParams()
  const toast = useToast()
  const { match, players, reload: reloadSquad } = useMatchAndSquad(id)
  const { contest, entries, picks, reload } = useContest(id, 'xi')
  const [fee, setFee] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [reason, setReason] = useState(REASONS[0])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { if (contest) { setFee(String(contest.fee)); setEnabled(contest.enabled) } }, [contest])

  if (!match || !contest) return <Shell title="Match control" back="/admin/matches"><p className="help">Loading…</p></Shell>

  const xiCount = (t: string) => players.filter((p) => p.team === t && p.in_xi).length
  const teams = [match.team_a, match.team_b]
  const pot = contest.fee * entries.length
  const top = entries.length ? Math.max(...entries.map((e) => Number(e.points))) : 0
  const winners = entries.filter((e) => Number(e.points) === top)
  const st = STATUS[contest.status]

  const run = async (key: string, fn: () => PromiseLike<{ error: unknown } | void>, done: string) => {
    setBusy(key)
    try {
      const r = await fn()
      if (r && r.error) throw r.error
      toast(done); await reload(); await reloadSquad()
    } catch (e) { toast(e instanceof Error ? e.message : errorText(e as never)) } finally { setBusy(null) }
  }

  return (
    <Shell title={`${match.team_a_short ?? shortTeam(match.team_a)} vs ${match.team_b_short ?? shortTeam(match.team_b)}`} kicker={`${match.label ?? match.format}, ${istDayName(match.starts_at)} ${istTime(match.starts_at)}`} back="/admin/matches"
      actions={<Link className="btn sm" to={`/match/${id}`}><span>Open match</span></Link>}>
      <div className="split-2">
        <div style={{ display: 'grid', gap: 8 }}>
          <section className="panel">
            <div className="ch"><h3>Predict the XI</h3><span className={st[1]}><span className="tx">{st[0]}</span></span></div>
            <div className="read"><span className="k">Locks</span><span className="v">{istDayName(contest.lock_at)} {istTime(contest.lock_at)}</span></div>
            <div className="read"><span className="k">Players</span><span className="v">{entries.length}</span></div>
            <div className="read"><span className="k">Pot</span><span className="v">{rupees(pot)}</span></div>
            {contest.status === 'cancelled' && <p className="help" style={{ marginTop: 8 }}>Cancelled: {contest.cancel_reason}</p>}

            {contest.status === 'open' && (
              <>
                <div className="rule">
                  <div><p className="k">Entry fee</p><p className="s">{entries.length ? 'Fixed now that people have joined' : 'Change before anyone joins'}</p></div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="help num">₹</span>
                    <input className="num-in" type="number" min={0} value={fee} disabled={entries.length > 0} onChange={(e) => setFee(e.target.value)} aria-label="Entry fee" /></span>
                </div>
                <label className="rule" style={{ cursor: 'pointer' }}>
                  <div><p className="k">Running for this match</p><p className="s">Turn off to hide it</p></div>
                  <input type="checkbox" role="switch" className="switch" checked={enabled} disabled={entries.length > 0} onChange={(e) => setEnabled(e.target.checked)} />
                </label>
                {entries.length === 0 && (
                  <button className="btn sm" style={{ marginTop: 10 }} disabled={busy === 'save'}
                    onClick={() => run('save', () => supabase.rpc('admin_update_contest', { p_match: id, p_game: 'xi', p_fee: Math.max(0, Math.floor(Number(fee) || 0)), p_enabled: enabled }), 'Game updated')}>
                    {busy === 'save' ? <span className="spinner" /> : <span>Save</span>}
                  </button>
                )}
              </>
            )}

            {contest.status === 'scored' && (
              <div style={{ marginTop: 14 }}>
                <p className="rt">{winners.length > 1 ? `${winners.length}-way tie on ${top} points` : `${winners[0]?.who?.name} wins with ${top} points`}</p>
                <p className="rs">Pot {rupees(pot)}{winners.length > 1 ? ', split equally' : ''}. Payouts go into wallets straight away.</p>
                <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy === 'pay'}
                  onClick={() => window.confirm(`Pay out ${rupees(pot)} now? This can’t be undone (except by adjusting wallets).`) && run('pay', () => supabase.rpc('admin_settle_contest', { p_contest: contest.id }), 'Paid out. Everyone has been told.')}>
                  {busy === 'pay' ? <span className="spinner" /> : <><Icon name="check" /><span>Finish and pay out <span className="num">{rupees(pot)}</span></span></>}
                </button>
              </div>
            )}

            {['open', 'locked', 'scored'].includes(contest.status) && entries.length > 0 && (
              cancelOpen ? (
                <div style={{ marginTop: 14 }}>
                  <span className="label-s">Why? Everyone sees this and gets their entry back.</span>
                  <div role="radiogroup" style={{ display: 'grid', gap: 6 }}>
                    {REASONS.map((r) => (
                      <button key={r} type="button" className="opt" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}>
                        <span className="radio" /><span style={{ fontSize: 14, fontWeight: 600 }}>{r}</span>
                      </button>
                    ))}
                  </div>
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn" onClick={() => setCancelOpen(false)}><span>Back</span></button>
                    <button className="btn danger" disabled={busy === 'cancel'} onClick={() => run('cancel', () => supabase.rpc('admin_cancel_contest', { p_contest: contest.id, p_reason: reason }), 'Cancelled and refunded')}>
                      {busy === 'cancel' ? <span className="spinner" /> : <span>Cancel and refund <span className="num">{rupees(pot)}</span></span>}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn danger sm" style={{ marginTop: 14 }} onClick={() => setCancelOpen(true)}><Icon name="ban" small /><span>Cancel and refund</span></button>
              )
            )}
          </section>

          <section className="panel">
            <div className="ch"><h3>Squads and Playing XI</h3>{match.xi_source && <span className="tag"><span className="tx">XI from {match.xi_source === 'api' ? 'data service' : 'you'}</span></span>}</div>
            {teams.map((t) => (
              <div key={t} className="read">
                <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TeamBadge team={t} size={28} img={t === match.team_a ? match.team_a_img : match.team_b_img} />{t}</span>
                <span className="v">{players.filter((p) => p.team === t).length} in squad, {xiCount(t)}/11 XI</span>
              </div>
            ))}
            <div className="btn-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn sm" disabled={busy === 'squad' || !match.fantasy_ok} onClick={() => run('squad', () => callFunction('sync-cricket', { mode: 'squad', matchId: id }).then(() => undefined), 'Squads updated')}>
                {busy === 'squad' ? <span className="spinner" /> : <><Icon name="refresh" small /><span>Fetch squads, ~10 credits</span></>}
              </button>
              <Link className="btn sm primary" to={`/admin/match/${id}/xi`}><Icon name="edit" small /><span>Edit Playing XI</span></Link>
            </div>
            <p className="help" style={{ marginTop: 8 }}>Saving 11 for both teams scores the game automatically. You can fix the XI and rescore until you pay out.</p>
          </section>
        </div>

        <section className="panel">
          <div className="ch"><h3>Who joined</h3><span className="help num">{entries.length}</span></div>
          {entries.length === 0 ? <Empty icon="user" title="Nobody yet" /> : (
            <div className="list">
              {[...entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((e) => (
                <div key={e.id} className="row" style={{ background: 'var(--sand)' }}>
                  <Avatar name={e.who?.name ?? '?'} color={e.who?.color ?? '#C7B6F7'} />
                  <span><span className="rt">{e.who?.name}</span>
                    <span className="rs">{contest.status === 'open' ? 'Picks hidden until the lock' : `${picks.filter((p) => p.entry_id === e.id).length} picks`}{['scored', 'paid'].includes(contest.status) ? `, ${e.correct}/22 right` : ''}</span></span>
                  <span className="hist-right">
                    {['scored', 'paid'].includes(contest.status) && <span className="amt">{e.points} pts</span>}
                    {e.payout > 0 && <span className="tag ok"><span className="tx">Won {rupees(e.payout)}</span></span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  )
}
