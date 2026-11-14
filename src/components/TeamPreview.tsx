import { initials, shortTeam, teamColor } from '../lib/cricket'
import type { MatchPlayer } from '../lib/types'
import { ROLE_ORDER, ROLE_PLURAL } from '../lib/useGames'

/** A Fantasy XI laid out on a pitch, by role, with C and VC marked. */
export function TeamPreview({ players, captain, vice, points }: { players: MatchPlayer[]; captain: string | null; vice: string | null; points?: Map<string, number> }) {
  return (
    <div className="field-pitch" aria-label="Team preview">
      {ROLE_ORDER.map((r) => {
        const line = players.filter((p) => p.role === r)
        if (!line.length) return null
        return (
          <div key={r} className="pline">
            <p className="pline-k">{line.length === 1 ? ROLE_PLURAL[r].replace(/s$/, '') : ROLE_PLURAL[r]}</p>
            <div className="pline-row">
              {line.map((p) => (
                <div key={p.player_id} className="pchip">
                  {(captain === p.player_id || vice === p.player_id) && <span className="cv-tag">{captain === p.player_id ? 'C' : 'VC'}</span>}
                  <span className="p-ini" style={{ ['--tc' as string]: teamColor(p.team) }} aria-hidden="true">{initials(p.name)}</span>
                  <span className="nm">{p.name.split(' ').slice(-1)[0]}</span>
                  <span className="tm">{points ? `${points.get(p.player_id) ?? 0} pts` : shortTeam(p.team)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
