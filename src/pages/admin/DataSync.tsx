import { Link } from 'react-router-dom'
import { CricbuzzPanel } from '../../components/CricbuzzPanel'
import { reportSummary, useMatchReport } from '../../components/MatchReport'
import { Shell } from '../../components/Shell'
import { SkPanel, SkRows } from '../../components/Skeleton'
import { useSettingsForm } from '../../lib/useSettingsForm'

type Shows = { show_men_intl: boolean; show_leagues: boolean; show_domestic: boolean }

/** Cricket data from Cricbuzz: is it working, sync now, and which kinds of match members see. */
export function DataSync() {
  const report = useMatchReport()
  const { f, set, save, busy } = useSettingsForm<Shows>(['show_men_intl', 'show_leagues', 'show_domestic'])
  const Toggle = ({ k, label }: { k: keyof Shows; label: string }) => (
    <label className="rule" style={{ cursor: 'pointer' }}>
      <span className="k">{label}</span>
      <input type="checkbox" role="switch" className="switch" checked={Boolean(f?.[k])} onChange={(e) => set(k, e.target.checked as never)} />
    </label>
  )
  return (
    <Shell title="Cricket data" kicker="Cricbuzz" back="/admin">
      <div className="cols-2">
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <CricbuzzPanel />
          {!f ? <SkPanel lines={4} /> : (
            <section className="panel">
              <div className="ch"><h3>Which matches to show</h3></div>
              <Toggle k="show_men_intl" label="Men’s internationals" />
              <Toggle k="show_leagues" label="IPL and other leagues" />
              <Toggle k="show_domestic" label="Domestic (Ranji, SMAT, Vijay Hazare…)" />
              <p className="help" style={{ marginTop: 8 }}>Women’s cricket is not shown.</p>
              <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void save()}>{busy ? <span className="spinner" /> : <span>Save</span>}</button>
            </section>
          )}
        </div>
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="ch"><h3>What members see</h3><Link className="textlink" style={{ minHeight: 0 }} to="/admin/matches">Every match and why</Link></div>
          {!report.rows ? <SkRows n={5} avatar={false} /> : report.rows.length === 0 ? <p className="help">No matches yet. Tap Sync now.</p> : (
            <div className="list">
              {reportSummary(report.rows).map((x) => (
                <div key={x.reason} className="read"><span className="k">{x.reason === 'Shown' ? <b>Members see them</b> : x.reason}</span><span className="v">{x.n}</span></div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  )
}
