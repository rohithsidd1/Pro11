import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../../components/Icon'
import { WelcomeArt } from '../../components/WelcomeArt'

const FEATURES: { icon: IconName; color: string; title: string; text: string; short: string }[] = [
  { icon: 'stumps', color: 'var(--blue)', title: 'Predict the Playing XI', text: 'Guess both teams’ 11 before the toss.', short: 'Predict the XI' },
  { icon: 'trophy', color: 'var(--coral)', title: 'Fantasy XI', text: 'Pick 11 players. Points come from the real match.', short: 'Fantasy XI' },
  { icon: 'wallet', color: 'var(--mint)', title: 'Settle up in the app', text: 'Pay on UPI, upload the screenshot, done.', short: 'Settle on UPI' },
]

export function Welcome() {
  return (
    <div className="auth">
      <div className="auth-art">
        <WelcomeArt />
        <div className="wide-only">
          <p className="brand" style={{ fontSize: 72 }}>PRO11</p>
          <p className="lead" style={{ fontSize: 17, color: 'var(--ink)', maxWidth: '34ch' }}>
            Cricket games for the family. Small stakes, big bragging rights.
          </p>
        </div>
      </div>
      <div className="auth-form">
        <div className="inner">
          <div className="narrow-only">
            <p className="brand">PRO11</p>
            <p className="lead" style={{ fontSize: 16, color: 'var(--ink)', maxWidth: '32ch', marginTop: 10 }}>
              Cricket games for the family. Small stakes, big bragging rights.
            </p>
            <div className="feats" style={{ marginTop: 18 }}>
              {FEATURES.map((f) => (
                <span key={f.short} className="fpill">
                  <span className="d" style={{ ['--c' as string]: f.color }}><Icon name={f.icon} /></span>
                  <span className="tx">{f.short}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="wide-only">
            <h1 className="h1">Welcome</h1>
            <p className="lead">Two games every match, for the family.</p>
            <div className="list" style={{ marginTop: 24 }}>
              {FEATURES.map((f) => (
                <div key={f.title} className="row sand">
                  <span className="ic" style={{ ['--b' as string]: f.color }}><Icon name={f.icon} /></span>
                  <span><span className="rt">{f.title}</span><span className="rs">{f.text}</span></span>
                  <span />
                </div>
              ))}
            </div>
          </div>
          <div className="grow" />
          <Link to="/sign-in" className="btn primary block" style={{ marginTop: 28 }}><span>Get started</span></Link>
          <p style={{ textAlign: 'center', marginTop: 6 }}>
            <Link to="/sign-in" className="textlink">Already joined? Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
