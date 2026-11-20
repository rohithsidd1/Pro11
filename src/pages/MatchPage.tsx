import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty } from '../components/Empty'
import { Icon } from '../components/Icon'
import { Shell } from '../components/Shell'
import { TeamBadge } from '../components/TeamBadge'
import { GameCard } from '../components/GameCard'
import { callFunction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isLive, scoreFor, scoreText, shortTeam } from '../lib/cricket'
import { istDayName, istTime, untilText } from '../lib/ist'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { Match, MatchPlayer } from '../lib/types'
import { SkScreen } from '../components/Skeleton'
import { useLiveReload, useNow } from '../lib/live'
import { SearchBar, useQuery } from '../components/SearchBar'
import { roleWords, smartFilter } from '../lib/search'

const ROLE_LABEL: Record<MatchPlayer['role'], string> = { WK: 'Wicketkeeper', BAT: 'Batter', AR: 'All-rounder', BOWL: 'Bowler' }
const ROLE_ORDER: MatchPlayer['role'][] = ['BAT', 'WK', 'AR', 'BOWL']

export function MatchPage() {
  const { id = '' } = useParams()
  const [sq, setSq] = useQuery(`squad.${id}`)
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [m, setM] = useState<Match | null>(null)
  const [players, setPlayers] = useState<MatchPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useNow(30000)
  const load = useCallback(async () => {
    const [mr, pr] = await Promise.all([
      supabase.from('matches').select('*').eq('id', id).maybeSingle(),
      supabase.from('match_players').select('*').eq('match_id', id).order('name'),
    ])
    setM(mr.data as Match | null)
    setPlayers((pr.data as MatchPlayer[] | null) ?? [])
    setLoading(false)
  }, [id])
  useLiveReload(['matches', 'contests', 'entries'], load)
  useEffect(() => { void load() }, [load])
  // while the match is being played, re-read it every minute (the server updates the score; no extra credits here)
  useEffect(() => {
    if (!m || !m.started || m.ended) return
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60000)
    return () => window.clearInterval(t)
  }, [m, load])

  const run = async (mode: 'info' | 'squad') => {
    if (!m) return
    setBusy(mode)
    try {
      await callFunction('sync-cricket', { mode, matchId: id })
      toast('Match updated')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t update')
    } finally { setBusy(null) }
  }

  if (loading) return <Shell title="Match" back="/"><SkScreen rows={3} /></Shell>
  if (!m) return <Shell title="Match" back="/"><Empty icon="stumps" title="Match not found">It may have been removed from the list.</Empty></Shell>

  const live = isLive(m)
  const tossLine = m.toss_winner
    ? `${m.toss_winner} won the toss and chose to ${m.toss_choice === 'bowl' ? 'bowl' : 'bat'}`
    : null
  const teams = [m.team_a, m.team_b]

  return (
    <Shell title={`${m.team_a_short ?? shortTeam(m.team_a)} vs ${m.team_b_short ?? shortTeam(m.team_b)}`}
      kicker={[m.label, m.series_name].filter(Boolean).join(', ') || m.format} back="/">
      <div className="match-cols">
        <div>
          <section className="chead" aria-label="Match">
            {m.ended && m.status_text && <p className="result">{m.status_text}</p>}
            <div className="face">
              <div className="team"><TeamBadge team={m.team_a} short={m.team_a_short} img={m.team_a_img} size={84} /><span className="tn">{m.team_a}</span></div>
              <div className="when"><span className="clock num">{istTime(m.starts_at)}</span><span className="day">{istDayName(m.starts_at)}</span></div>
              <div className="team"><TeamBadge team={m.team_b} short={m.team_b_short} img={m.team_b_img} size={84} /><span className="tn">{m.team_b}</span></div>
            </div>
            {m.venue && <p className="ground-line">{m.venue}</p>}
            {(m.started || m.ended) && <p style={{ textAlign: 'center', marginTop: 8 }}><a className="textlink" href={`/match/${m.id}/scorecard`} style={{ minHeight: 0 }}>Scorecard</a></p>}

            {(m.started || m.ended) && m.score.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {teams.map((t) => {
                  const inn = scoreFor(m, t)
                  return (
                    <div key={t} className="scoreline">
                      <span className="tm"><TeamBadge team={t} size={34} img={t === m.team_a ? m.team_a_img : m.team_b_img} />{t}</span>
                      <span>
                        {inn.length ? inn.map((s, i) => <span key={i} className="sc">{scoreText(s)}</span>) : <span className="sc" style={{ fontSize: 15 }}>Yet to bat</span>}
                        {inn.at(-1)?.o !== undefined && <span className="ov">{inn.at(-1)!.o} overs</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="toss">
              <Icon name={live ? 'stumps' : 'clock'} />
              <div>
                <p className="toss-t">{live ? 'In play' : m.ended ? 'Finished' : tossLine ? 'Toss done' : <>Toss around <span className="num">{istTime(new Date(new Date(m.starts_at).getTime() - 30 * 60000).toISOString())}</span></>}</p>
                <p className="toss-s">{tossLine ?? (live || m.ended ? m.status_text : <>Starts at <span className="num">{istTime(m.starts_at)}</span></>)}</p>
              </div>
              {!m.started && !m.ended && <span className="count num">{new Date(m.starts_at).getTime() > Date.now() ? untilText(m.starts_at) : 'Toss soon'}</span>}
            </div>
          </section>

          <ol className="stack games" aria-label="Games for this match">
            <GameCard match={m} game="xi" />
            <GameCard match={m} game="fantasy" />
          </ol>
          <p className="fine">Each game needs at least 2 players by its lock. If it doesn’t fill, or the match is abandoned, it’s cancelled and nobody owes anything.</p>

          {isAdmin && (
            <>
              <div className="sec"><h2>Admin</h2></div>
              <div className="btn-row wrap" style={{ marginBottom: 8 }}>
              <button className="btn sm" disabled={!!busy} onClick={() => run('info')}>
                {busy === 'info' ? <span className="spinner" /> : <Icon name="refresh" small />}<span>Refresh match</span>
              </button>
              <a className="btn sm" href={`/admin/match/${m.id}`}><Icon name="trophy" small /><span>Game status</span></a>
              </div>
            </>
          )}
        </div>

        <div>
          <div className="sec" style={{ paddingTop: 0 }}>
            <h2>Squads</h2>
            {players.length > 0 && <span className="aside"><span className="num">{players.length}</span> players</span>}
          </div>
          {players.length > 0 && <div className="search-wrap"><SearchBar value={sq} onChange={setSq} placeholder="Search players" label="Search the squads" /></div>}
          {sq && players.length > 0 && !players.some((p) => smartFilter([p], sq, (x) => [x.name, roleWords(x.role)]).length) && <p className="help">No player matches “{sq.trim()}”.</p>}
          {players.length === 0 ? (
            <div className="panel" style={{ background: 'var(--soft)' }}>
              <p className="rt">Squads aren’t loaded yet</p>
              <p className="rs">They load from Cricbuzz by themselves as soon as it publishes them.</p>
            </div>
          ) : (
            teams.map((t) => {
              const list = smartFilter(players.filter((p) => p.team.toLowerCase() === t.toLowerCase())
                .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name)), sq, (p) => [p.name, roleWords(p.role)])
              if (!list.length) return null
              return (
                <section key={t} className="panel" style={{ marginBottom: 8 }}>
                  <div className="ch"><h3><TeamBadge team={t} size={28} img={t === m.team_a ? m.team_a_img : m.team_b_img} /> {t}</h3><span className="help num">{list.length}</span></div>
                  <div className="squad-list">
                    {list.map((p) => (
                      <div key={p.player_id} className="prow">
                        <span className="rt" style={{ fontSize: 14.5 }}>{p.name}</span>
                        <span className="role"><span className="tx">{ROLE_LABEL[p.role]}</span></span>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>
      </div>
    </Shell>
  )
}
