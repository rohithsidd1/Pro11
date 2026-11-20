import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { Empty } from '../components/Empty'
import { Shell } from '../components/Shell'
import { useAuth } from '../lib/auth'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import { SkScreen } from '../components/Skeleton'

interface Row { user_id: string; name: string; color: string; played: number; won: number; winnings: number; spent: number; net: number; bonus: number }
type Period = 'month' | 'year' | 'all'
type Game = 'all' | 'xi' | 'fantasy'

const periodStart = (p: Period) => {
  if (p === 'all') return null
  const ist = new Date(Date.now() + 5.5 * 3600e3)
  return new Date(Date.UTC(ist.getUTCFullYear(), p === 'month' ? ist.getUTCMonth() : 0, 1) - 5.5 * 3600e3).toISOString()
}

export function Ranks() {
  const { profile, settings } = useAuth()
  const cfg = (settings ?? {}) as unknown as { bonus_reset?: 'month' | 'year' | 'never'; show_bonus?: boolean }
  const showBonus = cfg.show_bonus ?? true
  const [period, setPeriod] = useState<Period>(cfg.bonus_reset === 'year' ? 'year' : cfg.bonus_reset === 'never' ? 'all' : 'month')
  const [sortBy, setSortBy] = useState<'net' | 'bonus'>('net')
  const [game, setGame] = useState<Game>('all')
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    setRows(null)
    void supabase.rpc('leaderboard', { p_since: periodStart(period), p_game: game === 'all' ? null : game })
      .then(({ data }) => setRows((data as Row[] | null) ?? []))
  }, [period, game])

  const active = (rows ?? []).filter((r) => r.played > 0).sort((a, b) => sortBy === 'bonus' ? b.bonus - a.bonus || b.net - a.net : 0)
  const leader = active[0]
  return (
    <Shell title="Ranks" kicker={period === 'month' ? new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : period === 'year' ? new Date().toLocaleDateString('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'All time'}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 720 }}>
        <div className="seg" role="group" aria-label="Period" style={{ flex: '1 1 220px' }}>
          <button aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Month</button>
          <button aria-pressed={period === 'year'} onClick={() => setPeriod('year')}>Year</button>
          <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>All time</button>
        </div>
        <div className="seg" role="group" aria-label="Game" style={{ flex: '1 1 300px' }}>
          <button aria-pressed={game === 'all'} onClick={() => setGame('all')}>Both</button>
          <button aria-pressed={game === 'xi'} onClick={() => setGame('xi')}>Playing XI</button>
          <button aria-pressed={game === 'fantasy'} onClick={() => setGame('fantasy')}>Fantasy</button>
        </div>
      </div>
      {showBonus && (
        <div className="seg sm" role="group" aria-label="Rank by" style={{ marginTop: 8, maxWidth: 360 }}>
          <button aria-pressed={sortBy === 'net'} onClick={() => setSortBy('net')}>By money</button>
          <button aria-pressed={sortBy === 'bonus'} onClick={() => setSortBy('bonus')}>By bonus points</button>
        </div>
      )}
      {!rows && <div style={{ marginTop: 16, maxWidth: 720 }}><SkScreen rows={4} /></div>}
      {rows && active.length === 0 && <Empty icon="trophy" title="No finished games yet">Ranks fill in as games finish and pay out.</Empty>}
      {leader && (
        <section className="chead" style={{ ['--c' as string]: 'var(--lemon)', marginTop: 16, maxWidth: 720, paddingBottom: 20 }}>
          <div className="score-hero">
            <Avatar name={leader.name} color={leader.color} size="xl" />
            <p style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, marginTop: 8 }}>{leader.user_id === profile?.id ? 'You’re on top' : `${leader.name.split(' ')[0]} leads`}</p>
            <p className="big" style={{ fontSize: 44 }}>{sortBy === 'bonus' ? `${leader.bonus} pts` : rupees(leader.net, { sign: true })}</p>
            <p style={{ fontSize: 13, fontWeight: 500 }}><span className="num">{leader.won}</span> won of <span className="num">{leader.played}</span> games</p>
          </div>
        </section>
      )}
      {active.length > 0 && (
        <div className="list" style={{ marginTop: 12, maxWidth: 720 }}>
          {active.map((r, i) => (
            <div key={r.user_id} className={`rank-row${r.user_id === profile?.id ? ' me' : ''}`}>
              <span className="pos">{i + 1}</span>
              <Avatar name={r.name} color={r.color} />
              <span style={{ minWidth: 0 }}>
                <span className="rt">{r.user_id === profile?.id ? 'You' : r.name}</span>
                <span className="rs"><span className="num">{r.won}</span>/<span className="num">{r.played}</span> won · won <span className="num">{rupees(r.winnings)}</span>, lost <span className="num">{rupees(r.spent)}</span>{showBonus ? <>, <span className="num">{r.bonus}</span> bonus pts</> : null}</span>
              </span>
              <span className="pts" style={{ color: sortBy === 'bonus' ? undefined : r.net > 0 ? 'var(--ok)' : r.net < 0 ? 'var(--bad)' : undefined }}>{sortBy === 'bonus' ? r.bonus : rupees(r.net, { sign: true })}</span>
            </div>
          ))}
        </div>
      )}
      <p className="fine" style={{ paddingLeft: 0, maxWidth: 720 }}>Net = money won minus entry fees, for finished games only. Cancelled games don’t count.{showBonus ? ' Bonus points are just for bragging: they never turn into money.' : ''}</p>
    </Shell>
  )
}
