import { useAuth } from '../lib/auth'

export function Splash() {
  const { connectionError, refresh } = useAuth()
  return (
    <div className="splash" aria-busy={!connectionError} aria-label="Loading Pro11">
      <div style={{ textAlign: 'center', padding: 24 }}>
        <p className="brand" style={{ fontSize: 56 }}>PRO11</p>
        {connectionError && (
          <>
            <p className="lead" role="alert">Can’t reach Pro11 right now. Check your connection.</p>
            <button className="btn primary" style={{ marginTop: 20 }} onClick={() => void refresh()}><span>Try again</span></button>
          </>
        )}
      </div>
    </div>
  )
}
