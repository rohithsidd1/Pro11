import { useState } from 'react'
import { flagFor, initials, teamColor } from '../lib/cricket'

/** National flag when we have one, else the API's team logo, else initials on a team colour. */
export function TeamBadge({ team, short, img, size = 46 }: { team: string; short?: string | null; img?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  const flag = flagFor(team)
  const style = { width: size, height: size }
  if (flag) {
    return (
      <span className="badge flag" style={style} role="img" aria-label={team}>
        <svg viewBox="0 0 60 60" aria-hidden="true"><use href={`#flag-${flag}`} /></svg>
      </span>
    )
  }
  if (img && !broken) {
    return (
      <span className="badge logo" style={style} role="img" aria-label={team}>
        <img src={img} alt="" loading="lazy" onError={() => setBroken(true)} />
      </span>
    )
  }
  return (
    <span className="badge" style={{ ...style, ['--tc' as string]: teamColor(team), fontSize: Math.max(10, Math.round(size / 4)) }} role="img" aria-label={team}>
      {initials(team, short)}
    </span>
  )
}
