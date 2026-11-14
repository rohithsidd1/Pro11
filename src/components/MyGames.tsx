import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { istDate } from '../lib/ist'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import { Icon } from './Icon'

interface Row {
  id: string; points: number; rank: number | null; payout: number; created_at: string
  contests: { game: 'xi' | 'fantasy'; status: string; fee: number; match_id: string; matches: { team_a: string; team_b: string; team_a_short: string | null; team_b_short: string | null; starts_at: string } }
}

/** Your recent games with their result. */
export function MyGames() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    if (!profile) return
    void supabase.from('entries')
      .select('id, points, rank, payout, created_at, contests!inner(game, status, fee, match_id, matches!inner(team_a, team_b, team_a_short, team_b_short, starts_at))')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setRows((data as unknown as Row[] | null) ?? []))
  }, [profile])
  if (!rows) return null
  if (!rows.length) return <p className="help">No games yet. Join one from a match.</p>
  return (
    <div className="list">
      {rows.map((r) => {
        const c = r.contests, m = c.matches
        const res = c.status === 'paid' ? (r.payout > 0 ? { t: `Won ${rupees(r.payout)}`, cls: 'tag ok' } : { t: `${r.rank ?? '–'}${r.rank === 1 ? 'st' : r.rank === 2 ? 'nd' : r.rank === 3 ? 'rd' : 'th'}`, cls: 'tag' })
          : c.status === 'cancelled' ? { t: 'Refunded', cls: 'tag' } : c.status === 'open' ? { t: 'Open', cls: 'tag ok' } : { t: 'In play', cls: 'tag warn' }
        return (
          <Link key={r.id} className="row" to={`/match/${c.match_id}${c.status === 'open' ? '' : c.game === 'xi' ? '/xi/results' : '/fantasy/results'}`}>
            <span className="ic" style={{ ['--b' as string]: c.game === 'xi' ? 'var(--blue)' : 'var(--coral)' }}><Icon name="trophy" /></span>
            <span style={{ minWidth: 0 }}>
              <span className="rt">{m.team_a_short ?? m.team_a} vs {m.team_b_short ?? m.team_b}</span>
              <span className="rs">{c.game === 'xi' ? 'Predict the XI' : 'Fantasy XI'}, {istDate(m.starts_at)}, entry {rupees(c.fee)}</span>
            </span>
            <span className={res.cls}><span className="tx">{res.t}</span></span>
          </Link>
        )
      })}
    </div>
  )
}
