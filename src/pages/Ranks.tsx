import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Link } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { useAuth } from '../lib/auth'
import { rupees } from '../lib/money'
import { supabase } from '../lib/supabase'
import { SkScreen, SkSwap } from '../components/Skeleton'
import { SearchBar, useQuery } from '../components/SearchBar'
import { smartFilter } from '../lib/search'

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

  const ranked = (rows ?? []).filter((r) => r.played > 0).sort((a, b) => sortBy === 'bonus' ? b.bonus - a.bonus || b.net - a.net : 0)
  const [rq, setRq] = useQuery('ranks')
  const active = smartFilter(ranked, rq, (r) => [r.name])
  const leader = rq ? undefined : ranked[0]
  const periodWord = period === 'month' ? 'this month' : period === 'year' ? 'this year' : 'yet'
  return (
    <Shell title="Ranks" kicker={period === 'month' ? new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : period === 'year' ? new Date().toLocaleDateString('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'All time'}>
      <div className="ranks-filters">
        <div className="seg" role="group" aria-label="Period">
          <button aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Month</button>
          <button aria-pressed={period === 'year'} onClick={() => setPeriod('year')}>Year</button>
          <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>All time</button>
        </div>
        <div className="ranks-chips">
          <div className="chips" role="group" aria-label="Game">
            <button className="chip" aria-pressed={game === 'all'} onClick={() => setGame('all')}><span className="tx">Both games</span></button>
            <button className="chip" aria-pressed={game === 'xi'} onClick={() => setGame('xi')}><span className="tx">Playing XI</span></button>
            <button className="chip" aria-pressed={game === 'fantasy'} onClick={() => setGame('fantasy')}><span className="tx">Fantasy</span></button>
          </div>
          {showBonus && (
            <div className="chips" role="group" aria-label="Rank by">
              <button className="chip" aria-pressed={sortBy === 'net'} onClick={() => setSortBy('net')}><span className="tx">₹ Money</span></button>
              <button className="chip" aria-pressed={sortBy === 'bonus'} onClick={() => setSortBy('bonus')}><span className="tx">★ Bonus</span></button>
            </div>
          )}
        </div>
      </div>
      <SkSwap loading={!rows} skeleton={<div style={{ marginTop: 16, maxWidth: 720 }}><SkScreen rows={4} /></div>}>
      {rows && ranked.length === 0 && (
        <section className="panel ranks-empty">
          <span className="ic" aria-hidden="true"><Icon name="trophy" /></span>
          <div>
            <p className="rt">No finished games {periodWord}</p>
            <p className="rs">When a game you’re in finishes, the standings show up here.</p>
            <div className="btn-row wrap" style={{ marginTop: 12 }}>
              <Link className="btn sm primary" to="/"><span>Find a match</span></Link>
              {period !== 'all' && <button className="btn sm" onClick={() => setPeriod('all')}><span>See all time</span></button>}
            </div>
          </div>
        </section>
      )}
      {leader && (
        <section className="ranks-leader">
          <Avatar name={leader.name} color={leader.color} />
          <span className="who">
            <span className="k">{leader.user_id === profile?.id ? 'You’re on top' : `${leader.name.split(' ')[0]} leads`}</span>
            <span className="s"><span className="num">{leader.won}</span> won of <span className="num">{leader.played}</span> games</span>
          </span>
          <span className="amt num">{sortBy === 'bonus' ? `${leader.bonus} pts` : rupees(leader.net, { sign: true })}</span>
        </section>
      )}
      {ranked.length > 0 && (
        <div className="list" style={{ marginTop: 12, maxWidth: 720 }}>
          {ranked.length > 5 && <div className="search-wrap" style={{ marginTop: 0 }}><SearchBar value={rq} onChange={setRq} placeholder="Search players" label="Search ranks" /></div>}
          {rq && !active.length && <p className="help">Nobody matches “{rq.trim()}”.</p>}
          {active.map((r) => (
            <div key={r.user_id} className={`rank-row${r.user_id === profile?.id ? ' me' : ''}`}>
              <span className="pos">{ranked.indexOf(r) + 1}</span>
              <Avatar name={r.name} color={r.color} />
              <span style={{ minWidth: 0 }}>
                <span className="rt">{r.user_id === profile?.id ? 'You' : r.name}</span>
                <span className="rs"><span className="num">{r.won}</span>/<span className="num">{r.played}</span> won · won <span className="num">{rupees(r.winnings)}</span>, lost <span className="num">{rupees(r.spent)}</span>{showBonus ? <> · <span className="num">{r.bonus}</span> bonus pts</> : null}</span>
              </span>
              <span className="pts" style={{ color: sortBy === 'bonus' ? undefined : r.net > 0 ? 'var(--ok)' : r.net < 0 ? 'var(--bad)' : undefined }}>{sortBy === 'bonus' ? r.bonus : rupees(r.net, { sign: true })}</span>
            </div>
          ))}
        </div>
      )}
      <details className="panel faq ranks-how">
        <summary className="rt">How ranks work</summary>
        <p className="help" style={{ color: 'var(--ink)', marginTop: 8, lineHeight: 1.55 }}>Money is what others owe you minus what you owe, from finished games: the same amounts as Ledger. Cancelled games don’t count.{showBonus ? ' Bonus points are just for bragging: they never turn into money.' : ''}</p>
      </details>
      </SkSwap>
    </Shell>
  )
}
