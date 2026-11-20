import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { pushAsked, pushPermission } from '../lib/push'
import { money, useLedger } from '../lib/useLedger'
import { Empty } from '../components/Empty'
import { Icon } from '../components/Icon'
import { MatchCard } from '../components/MatchCard'
import { Shell } from '../components/Shell'
import { Bell } from '../components/Bell'
import { useAuth } from '../lib/auth'
import { CARD_COLORS } from '../lib/cricket'
import { filterMatches, useGamesFor, useMatchFeed, type DayTab, type FormatChip } from '../lib/useMatches'
import { Sk, SkCards } from '../components/Skeleton'
import { useNow } from '../lib/live'

const TAB_LABEL: Record<DayTab, string> = { Today: 'Today', Tomorrow: 'Tomorrow', Later: 'Later', Live: 'Live', Mine: 'My games' }
const CHIPS: FormatChip[] = ['All', 'T20', 'ODI', 'Test', 'Women']

export function Home() {
  const { profile, settings } = useAuth()
  const cfg = (settings ?? {}) as unknown as { home_tab?: DayTab; app_name?: string }
  const TABS: DayTab[] = ['Today', 'Tomorrow', 'Later', 'Live', 'Mine']
  const navigate = useNavigate()
  useEffect(() => { if (!pushAsked() && pushPermission() === 'default') navigate('/alerts') }, [navigate])
  const { matches, loading, error, reload } = useMatchFeed('match_feed')
  useNow(30000)
  const { balances, total } = useLedger()
  const location = useLocation()
  const [tab, setTab] = useState<DayTab>((location.state as { tab?: DayTab } | null)?.tab ?? (cfg.home_tab === 'Mine' ? 'Mine' : 'Today'))
  const [chip, setChip] = useState<FormatChip>('All')
  const games = useGamesFor(matches.map((m) => m.id))
  const mineSet = new Set([...games.entries()].filter(([, g]) => g.mine).map(([id]) => id))
  const shown = filterMatches(matches, tab, chip, mineSet)
  const todayCount = filterMatches(matches, 'Today', 'All').length
  const liveCount = filterMatches(matches, 'Live', 'All', mineSet).length

  return (
    <Shell title="Matches" kicker={profile ? `Hi ${profile.name.split(' ')[0]}` : undefined}
      actions={<>
        <Link to="/ledger" className="wallet-chip" aria-label="Ledger" style={{ color: total > 0.004 ? 'var(--ok)' : total < -0.004 ? 'var(--bad)' : undefined }}>
          <Icon name="wallet" small /><span>{!balances ? '…' : total > 0.004 ? `You get ${money(total)}` : total < -0.004 ? `You owe ${money(-total)}` : 'Settled'}</span></Link>
        <Bell />
      </>}>
      <div className="hero-card">
        <div>
          <p className="kicker">Cricket</p>
          <p className="brand">{(cfg.app_name ?? 'Pro11').toUpperCase()}</p>
          <p className="lead">{loading ? <Sk w={200} h={14} /> : <><span className="num">{todayCount}</span> {todayCount === 1 ? 'match' : 'matches'} still to start today</>}{liveCount ? <>, <span className="num">{liveCount}</span> of yours live</> : ''}</p>
        </div>
        <svg className="ball" aria-hidden="true"><use href="#ball" /></svg>
      </div>

      <div className="controls">
        <nav className="tabs" aria-label="Match lists">
          {TABS.map((t) => (
            <button key={t} className="tab-pill" aria-pressed={tab === t} onClick={() => setTab(t)}>
              <span className="tx">{TAB_LABEL[t]}</span>
            </button>
          ))}
        </nav>
        <div className="chips" role="group" aria-label="Filter by format">
          {CHIPS.map((c) => (
            <button key={c} className="chip" aria-pressed={chip === c} onClick={() => setChip(c)}><span className="tx">{c}</span></button>
          ))}
        </div>
      </div>

      {error && (
        <Empty icon="alert" title="Couldn’t load matches" action={<button className="btn primary" onClick={() => void reload()}><span>Try again</span></button>}>
          Check your connection.
        </Empty>
      )}
      {loading && <SkCards n={4} />}
      {!error && !loading && shown.length === 0 && (
        <Empty icon="stumps" title={tab === 'Mine' ? 'You haven’t joined a game yet' : tab === 'Live' ? 'None of your matches are live' : `No ${chip === 'All' ? '' : chip === 'Women' ? 'women’s ' : `${chip} `}matches ${tab === 'Later' ? 'after tomorrow yet' : tab === 'Today' ? 'left today' : 'tomorrow yet'}`}
          action={chip !== 'All' ? <button className="btn primary" onClick={() => setChip('All')}><span>Show all formats</span></button> : undefined}>
          {tab === 'Live' ? 'Matches you’ve joined show here while they’re being played.' : 'New matches appear by themselves as Cricbuzz lists them.'}
        </Empty>
      )}
      {shown.length > 0 && (
        <ol className="stack grid" aria-label={`${tab}’s matches`}>
          {shown.map((m, i) => <MatchCard key={m.id} m={m} color={CARD_COLORS[i % CARD_COLORS.length]} games={games.get(m.id)} />)}
        </ol>
      )}
    </Shell>
  )
}
