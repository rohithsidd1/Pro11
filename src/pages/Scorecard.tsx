import { useParams } from 'react-router-dom'
import { Empty } from '../components/Empty'
import { Shell } from '../components/Shell'
import { TeamBadge } from '../components/TeamBadge'
import { scoreFor, scoreText, shortTeam } from '../lib/cricket'
import { useMatchAndSquad, usePlayerPoints } from '../lib/useGames'
import { useState } from 'react'

// deno-style loose shape of CricketData's scorecard (only read, never trusted for money)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Inn = any

export function Scorecard() {
  const { id = '' } = useParams()
  const { match, players, loading } = useMatchAndSquad(id)
  const points = usePlayerPoints(id)
  const [inn, setInn] = useState(0)
  if (loading) return <Shell title="Scorecard" back={`/match/${id}`}><p className="help">Loading…</p></Shell>
  if (!match) return <Shell title="Scorecard" back="/"><Empty icon="stumps" title="Match not found" /></Shell>
  const card = (match as unknown as { scorecard?: Inn[] | null }).scorecard ?? null
  const names = new Map(players.map((p) => [p.player_id, p]))
  const top = [...points.values()].map((p) => ({ ...p, pl: names.get(p.player_id) })).filter((p) => p.pl).sort((a, b) => Number(b.points) - Number(a.points)).slice(0, 8)
  const teams = [match.team_a, match.team_b]
  const cur: Inn | null = card?.[inn] ?? null

  return (
    <Shell title="Scorecard" kicker={`${match.team_a_short ?? shortTeam(match.team_a)} vs ${match.team_b_short ?? shortTeam(match.team_b)}${match.label ? `, ${match.label}` : ''}`} back={`/match/${id}`}>
      <div className="split-2">
        <div>
          <section className="panel">
            {match.ended && match.status_text && <p className="result" style={{ textAlign: 'left' }}>{match.status_text}</p>}
            {teams.map((t) => {
              const sc = scoreFor(match, t)
              return (
                <div key={t} className="scoreline">
                  <span className="tm"><TeamBadge team={t} size={34} img={t === match.team_a ? match.team_a_img : match.team_b_img} />{t}</span>
                  <span>{sc.length ? sc.map((s, i) => <span key={i} className="sc">{scoreText(s)}</span>) : <span className="sc" style={{ fontSize: 15 }}>Yet to bat</span>}
                    {sc.at(-1)?.o !== undefined && <span className="ov">{sc.at(-1)!.o} overs</span>}</span>
                </div>
              )
            })}
          </section>
          {top.length > 0 && (
            <>
              <div className="sec"><h2>Top performers</h2><span className="aside">fantasy points</span></div>
              <div className="list">
                {top.map((p) => (
                  <div key={p.player_id} className="mark ok" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span><span className="rt" style={{ fontSize: 14.5 }}>{p.pl!.name}</span><span className="rs">{shortTeam(p.pl!.team)}</span></span>
                    <span className="pts" style={{ fontSize: 17 }}>{Number(p.points)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div>
          {!card ? (
            <div className="panel" style={{ background: 'var(--soft)' }}>
              <p className="rt">Full batting and bowling card</p>
              <p className="rs">{match.ended ? 'Not fetched for this match. The admin can switch on “Full scorecard after the match” in Game rules (10 credits a match).' : 'Shown after the match if the admin has switched it on.'}</p>
            </div>
          ) : (
            <>
              <div className="seg sm" role="group" aria-label="Innings">
                {card.map((c: Inn, i: number) => <button key={i} aria-pressed={inn === i} onClick={() => setInn(i)}>{String(c?.inning ?? `Innings ${i + 1}`).replace(/ Inning.*/i, '')}{c?.totals?.R !== undefined ? ` ${c.totals.R}/${c.totals.W ?? ''}` : ''}</button>)}
              </div>
              <section className="panel tscroll" style={{ marginTop: 10 }}>
                <div className="ch"><h3>Batting</h3></div>
                <table className="wtable bat-table"><thead><tr><th scope="col">Batter</th><th scope="col" className="r">R</th><th scope="col" className="r">B</th><th scope="col" className="r">4s</th><th scope="col" className="r">6s</th><th scope="col" className="r">SR</th></tr></thead>
                  <tbody>{(cur?.batting ?? []).map((b: Inn, i: number) => (
                    <tr key={i}><td><span style={{ fontWeight: 600 }}>{b?.batsman?.name ?? '—'}</span><br /><span className="help">{b?.['dismissal-text'] ?? ''}</span></td>
                      <td className="r num">{b?.r ?? ''}</td><td className="r num">{b?.b ?? ''}</td><td className="r num">{b?.['4s'] ?? ''}</td><td className="r num">{b?.['6s'] ?? ''}</td><td className="r num">{b?.sr ?? ''}</td></tr>))}</tbody></table>
              </section>
              <section className="panel tscroll" style={{ marginTop: 8 }}>
                <div className="ch"><h3>Bowling</h3></div>
                <table className="wtable bat-table"><thead><tr><th scope="col">Bowler</th><th scope="col" className="r">O</th><th scope="col" className="r">M</th><th scope="col" className="r">R</th><th scope="col" className="r">W</th><th scope="col" className="r">Econ</th></tr></thead>
                  <tbody>{(cur?.bowling ?? []).map((b: Inn, i: number) => (
                    <tr key={i}><td style={{ fontWeight: 600 }}>{b?.bowler?.name ?? '—'}</td><td className="r num">{b?.o ?? ''}</td><td className="r num">{b?.m ?? ''}</td><td className="r num">{b?.r ?? ''}</td><td className="r num">{b?.w ?? ''}</td><td className="r num">{b?.eco ?? ''}</td></tr>))}</tbody></table>
              </section>
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}
