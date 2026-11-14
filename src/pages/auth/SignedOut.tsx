import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { WelcomeArt } from '../../components/WelcomeArt'
import { SIGNED_OUT_REASON } from '../../lib/auth'

export function SignedOut() {
  useEffect(() => { sessionStorage.removeItem(SIGNED_OUT_REASON) }, [])
  return (
    <div className="auth">
      <div className="auth-art wide-only"><WelcomeArt /></div>
      <div className="auth-form">
        <div className="inner" style={{ textAlign: 'center' }}>
          <div className="grow" />
          <span className="art" style={{ margin: '0 auto 16px' }}><Icon name="lock" /></span>
          <h1 className="h1">You’ve been signed out</h1>
          <p className="lead">Your sign-in ran out, or the admin signed everyone out. Sign in again to keep playing.</p>
          <div className="grow" />
          <Link to="/sign-in" className="btn primary block" style={{ marginTop: 28 }}><span>Sign in</span></Link>
        </div>
      </div>
    </div>
  )
}
