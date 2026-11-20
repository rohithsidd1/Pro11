import { Link } from 'react-router-dom'
import { istDayName, istTime } from '../lib/ist'
import type { GameKind } from '../lib/types'
import { useContest } from '../lib/useGames'
import { Icon } from './Icon'

/** After saving picks or a team: what was saved, until when it can change, and where to go next. */
export function SavedSheet({ matchId, game, title, detail, lockAt, onClose }: {
  matchId: string; game: GameKind; title: string; detail: string; lockAt: string; onClose: () => void
}) {
  const other: GameKind = game === 'xi' ? 'fantasy' : 'xi'
  const { contest, mine } = useContest(matchId, other)
  const otherOpen = contest?.enabled && contest.status === 'open' && new Date(contest.lock_at).getTime() > Date.now()
  const otherName = other === 'xi' ? 'Predict the XI' : 'Fantasy XI'
  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="done-card">
          <span className="tick"><Icon name="check" /></span>
          <p className="h1" style={{ fontSize: 24 }}>{title}</p>
          <p className="lead" style={{ color: 'var(--ink)', marginTop: 6 }}>{detail}</p>
          <p className="help" style={{ marginTop: 8, color: 'var(--ink)' }}>You can change it until {istDayName(lockAt).toLowerCase()} at {istTime(lockAt)}.</p>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          {otherOpen && (
            <Link className="btn primary block" to={mine ? `/match/${matchId}/${other === 'xi' ? 'xi' : 'fantasy'}` : `/match/${matchId}`}>
              <Icon name="trophy" small /><span>{mine ? `Edit your ${otherName}` : `Play ${otherName} too`}</span>
            </Link>
          )}
          <Link className={otherOpen ? 'btn block' : 'btn primary block'} to={`/match/${matchId}`}><span>Back to the match</span></Link>
          <div className="btn-row">
            <Link className="btn" to="/" state={{ tab: 'Mine' }}><span>My games</span></Link>
            <button className="btn" onClick={onClose}><Icon name="edit" small /><span>Keep editing</span></button>
          </div>
        </div>
      </div>
    </div>
  )
}
