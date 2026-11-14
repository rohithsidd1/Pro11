import { useState } from 'react'
import { Link } from 'react-router-dom'
import { rupees } from '../lib/money'
import { useWallet } from '../lib/useWallet'
import { Empty } from '../components/Empty'
import { Icon } from '../components/Icon'
import { MatchCard } from '../components/MatchCard'
import { Shell } from '../components/Shell'
import { useAuth } from '../lib/auth'
import { CARD_COLORS } from '../lib/cricket'
import { filterMatches, useGamesFor, useMatchFeed, type DayTab, type FormatChip } from '../lib/useMatches'

const TABS: DayTab[] = ['Today', 'Tomorrow', 'Live', 'Mine']
const TAB_LABEL: Record<DayTab, string> = { Today: 'Today', Tomorrow: 'Tomorrow', Live: 'Live', Mine: 'My games' }
const CHIPS: FormatChip[] = ['All', 'T20', 'ODI', 'Test', 'Women']

export function Home() {
  const { profile } = useAuth()
  const { matches, loading, error, reload } = useMatchFeed()
  const { balance, loading: walletLoading } = useWallet()
  const [tab, setTab] = useState<DayTab>('Today')
  const [chip, setChip] = useState<FormatChip>('All')
  const games = useGamesFor(matches.map((m) => m.id))
  const mineSet = new Set([...games.entries()].filter(([, g]) => g.mine).map(([id]) => id))
  const shown = filterMatches(matches, tab, chip, mineSet)
  const todayCount = filterMatches(matches, 'Today', 'All').length
  const liveCount = filterMatches(matches, 'Live', 'All').length

  return (
    <Shell title="Matches" kicker={profile ? `Hi ${profile.name.split(' ')[0]}` : undefined}
      actions={<>
        <Link to="/wallet" className="wallet-chip" aria-label={`Wallet, ${rupees(balance)}`}><Icon name="wallet" small /><span>{walletLoading ? '…' : rupees(balance)}</span></Link>
        <button className="icon-btn" aria-label="Notifications"><Icon name="bell" /></button>
      </>}>
      <div className="hero-card">
        <div>
          <p className="kicker">Cricket</p>
          <p className="brand">PRO11</p>
          <p className="lead"><span className="num">{todayCount}</span> {todayCount === 1 ? 'match' : 'matches'} today{liveCount ? <>, <span className="num">{liveCount}</span> live</> : ''}</p>
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
      {!error && !loading && shown.length === 0 && (
        <Empty icon="stumps" title={tab === 'Mine' ? 'You haven’t joined a game yet' : tab === 'Live' ? 'Nothing live right now' : `No ${chip === 'All' ? '' : chip === 'Women' ? 'women’s ' : `${chip} `}matches ${tab.toLowerCase()}`}
          action={chip !== 'All' ? <button className="btn primary" onClick={() => setChip('All')}><span>Show all formats</span></button> : undefined}>
          The list refreshes every few hours from the cricket data service.
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
