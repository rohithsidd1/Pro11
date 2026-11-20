import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { useSettingsForm } from '../../lib/useSettingsForm'
import { SkPanel } from '../../components/Skeleton'

export function Appearance() {
  const { f, set, save, busy } = useSettingsForm<{ card_style: 'notched' | 'plain' }>(['card_style'])
  if (!f) return <Shell title="Appearance" back="/admin"><SkPanel lines={3} /></Shell>
  return (
    <Shell title="Appearance" back="/admin">
      <section className="panel" style={{ maxWidth: 640 }}>
        <div className="rule stacked"><p className="k">Match cards</p>
          <div className="seg sm"><button aria-pressed={f.card_style === 'notched'} onClick={() => set('card_style', 'notched')}>Notched cards</button><button aria-pressed={f.card_style === 'plain'} onClick={() => set('card_style', 'plain')}>Plain cards</button></div>
          <p className="help">Notched cards stack like tickets with tabs. Plain cards are simple rounded boxes. Applies for everyone.</p></div>
        <button className="btn primary" style={{ marginTop: 14 }} disabled={busy} onClick={() => save()}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Save</span></>}</button>
      </section>
    </Shell>
  )
}
