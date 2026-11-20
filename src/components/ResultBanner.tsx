import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { istTime } from '../lib/ist'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { Contest } from '../lib/types'
import { Icon } from './Icon'

export interface Net { user_id: string; net: number; owes_to: string | null; owed_by: string | null }

/** Each player's exact result for one game (who owes whom), once it's final. */
export function useContestNets(contest: Contest | null) {
  const [nets, setNets] = useState<Record<string, Net>>({})
  useEffect(() => {
    if (!contest || contest.status !== 'paid') return
    void supabase.rpc('contest_nets', { p_contest: contest.id }).then(({ data }) =>
      setNets(Object.fromEntries(((data ?? []) as Net[]).map((n) => [n.user_id, { ...n, net: Number(n.net) }]))))
  }, [contest?.id, contest?.status])
  return nets
}

/** What this game means for you: provisional or final, and who owes whom, with the way to Ledger. */
export function ResultBanner({ contest, myNet, joined }: { contest: Contest; myNet?: Net; joined: boolean }) {
  if (contest.status === 'cancelled') return <p className="needs" style={{ marginTop: 14 }}>Cancelled. Nobody owes anything for this game.</p>
  if (contest.status === 'locked') return null
  if (contest.status === 'scored') {
    const at = contest.scored_at ? new Date(new Date(contest.scored_at).getTime() + 30 * 60000).toISOString() : null
    return <p className="needs" style={{ marginTop: 14 }}><Icon name="clock" small /> Provisional. Results become final{at ? ` at ${istTime(at)}` : ' about 30 minutes after the last scores'}, then who owes whom goes to Ledger.</p>
  }
  if (!joined) return <p className="needs" style={{ marginTop: 14 }}>Final.</p>
  const n = myNet?.net ?? 0
  return (
    <div className={`bal-hero ${n > 0.004 ? 'pos' : n < -0.004 ? 'neg' : 'zero'}`} style={{ marginTop: 14, padding: 16 }}>
      <p className="rt">{n > 0.004 ? 'You won' : n < -0.004 ? 'Final result' : 'You broke even'}</p>
      <p className="big" style={{ fontSize: 30 }}>{n > 0.004 ? `Others owe you ${rupees(n)}` : n < -0.004 ? `You owe ${rupees(-n)}` : rupees(0)}</p>
      {(myNet?.owes_to || myNet?.owed_by) && <p className="rs">{n < 0 ? `To ${myNet?.owes_to}` : `From ${myNet?.owed_by}`}</p>}
      {Math.abs(n) > 0.004 && <Link className="btn sm" style={{ marginTop: 10 }} to="/ledger"><Icon name="wallet" small /><span>{n < 0 ? 'Settle up in Ledger' : 'See Ledger'}</span></Link>}
    </div>
  )
}
