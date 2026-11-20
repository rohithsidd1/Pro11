import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { useSettingsForm } from '../../lib/useSettingsForm'
import { SkPanel } from '../../components/Skeleton'

type G = { app_name: string; admin_name: string; home_tab: 'Today' | 'Mine' }

export function GeneralSettings() {
  const { f, set, save, busy } = useSettingsForm<G>(['app_name', 'admin_name', 'home_tab'])
  if (!f) return <Shell title="General" back="/admin"><SkPanel lines={5} /></Shell>
  return (
    <Shell title="General" back="/admin">
      <section className="panel" style={{ maxWidth: 640 }}>
        <div className="field"><label htmlFor="an">App name</label><div className="input"><input id="an" value={f.app_name} maxLength={30} onChange={(e) => set('app_name', e.target.value)} /></div></div>
        <div className="field"><label htmlFor="ad">Admin name</label><div className="input"><input id="ad" value={f.admin_name} maxLength={40} onChange={(e) => set('admin_name', e.target.value)} /></div>
          <p className="help">Shown to members wherever the admin is mentioned.</p></div>
        <div className="rule stacked"><p className="k">Home opens on</p>
          <div className="seg sm"><button aria-pressed={f.home_tab === 'Today'} onClick={() => set('home_tab', 'Today')}>Today</button><button aria-pressed={f.home_tab === 'Mine'} onClick={() => set('home_tab', 'Mine')}>My games</button></div></div>
        <div className="rule"><p className="k">Time zone</p><span className="help">India (IST)</span></div>
        <button className="btn primary" style={{ marginTop: 14 }} disabled={busy || f.app_name.trim().length < 2 || f.admin_name.trim().length < 2}
          onClick={() => save({ app_name: f.app_name.trim(), admin_name: f.admin_name.trim() })}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Save</span></>}</button>
      </section>
    </Shell>
  )
}
