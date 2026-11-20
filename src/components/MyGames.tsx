import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { istDate } from '../lib/ist'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import { Empty } from './Empty'
import { Icon } from './Icon'
import { SkRows } from './Skeleton'
import { useLiveVersion } from '../lib/live'

interface Row {
  id: string; points: number; rank: number | null; payout: number; created_at: string
  contests: { game: 'xi' | 'fantasy'; status: string; fee: number; match_id: string; matches: { team_a: string; team_b: string; team_a_short: string | null; team_b_short: string | null; starts_at: string } }
}

/** Your recent games with their result. */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`

export function MyGames() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const v = useLiveVersion(['entries', 'contests'])
  useEffect(() => {
    if (!profile) return
    void supabase.from('entries')
      .select('id, points, rank, payout, created_at, contests!inner(game, status, fee, match_id, matches!inner(team_a, team_b, team_a_short, team_b_short, starts_at))')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setRows((data as unknown as Row[] | null) ?? []))
  }, [profile, v])
  if (!rows) return <SkRows n={3} />
  if (!rows.length) return <Empty icon="trophy" title="No games yet" action={<Link className="btn" to="/"><span>Find a match</span></Link>}>Join a game from any match with squads out.</Empty>
  return (
    <div className="list">
      {rows.map((r) => {
        const c = r.contests, m = c.matches
        const net = r.payout - c.fee
        const res = c.status === 'paid' ? (net > 0 ? { t: `Won · owed ${rupees(net)}`, cls: 'tag ok' } : net < 0 ? { t: `${r.rank ? ordinal(r.rank) + ' · ' : ''}owe ${rupees(-net)}`, cls: 'tag bad' } : { t: 'Broke even', cls: 'tag' })
          : c.status === 'cancelled' ? { t: 'Cancelled', cls: 'tag' }
          : c.status === 'open' ? { t: 'Open · edit picks', cls: 'tag ok' }
          : c.status === 'scored' ? { t: `${r.rank ? ordinal(r.rank) : '–'} · final soon`, cls: 'tag warn' }
          : { t: 'Locked · in play', cls: 'tag warn' }
        const to = `/match/${c.match_id}${c.status === 'open' ? (c.game === 'xi' ? '/xi' : '/fantasy') : c.status === 'cancelled' ? '' : c.game === 'xi' ? '/xi/results' : '/fantasy/results'}`
        return (
          <Link key={r.id} className="row" to={to}>
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
