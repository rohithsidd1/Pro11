import { useEffect, useState } from 'react'
import { DEFAULT_RULES, type Rules } from '../../shared/points'
import { errorText } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

type Fmt = 'T20' | 'ODI' | 'Test'
type NumKey = Exclude<keyof Rules, 'econ' | 'sr'>
const FIELDS: [string, [NumKey, string][]][] = [
  ['Batting', [['run', 'Per run'], ['four', 'Four (bonus)'], ['six', 'Six (bonus)'], ['b30', '30 runs'], ['b50', '50 runs'], ['b100', '100 runs'], ['duck', 'Duck (not bowlers)']]],
  ['Bowling', [['wicket', 'Wicket (not run out)'], ['lbwBowled', 'LBW or bowled bonus'], ['w3', '3 wickets'], ['w4', '4 wickets'], ['w5', '5 wickets'], ['maiden', 'Maiden over']]],
  ['Fielding', [['catch', 'Catch'], ['catch3', '3 catches bonus'], ['stumping', 'Stumping'], ['runoutDirect', 'Run out (direct)'], ['runoutShared', 'Run out (shared)']]],
  ['Other', [['xi', 'In the Playing XI']]],
]

/** Admin: the fantasy points table Pro11 uses (Cricbuzz source). Only changed values are stored. */
export function PointsRules() {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const [fmt, setFmt] = useState<Fmt>('T20')
  const [custom, setCustom] = useState<Record<string, Partial<Rules>>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCustom(((settings as unknown as { fx_rules?: Record<string, Partial<Rules>> })?.fx_rules) ?? {}) }, [settings])
  const val = (k: NumKey) => (custom[fmt]?.[k] as number | undefined) ?? DEFAULT_RULES[fmt][k]
  const set = (k: NumKey, v: number) => setCustom((c) => {
    const next = { ...(c[fmt] ?? {}) } as Record<string, number>
    if (v === DEFAULT_RULES[fmt][k]) delete next[k]; else next[k] = v
    return { ...c, [fmt]: next as Partial<Rules> }
  })
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('app_settings').update({ fx_rules: custom } as never).eq('id', 1)
    setBusy(false)
    if (error) return toast(errorText(error))
    await refresh(); toast('Points saved. They apply from the next live update.')
  }
  const changed = Object.keys(custom[fmt] ?? {}).length
  return (
    <section className="panel" style={{ marginTop: 8 }}>
      <div className="ch"><h3>Fantasy points</h3><span className="help">{changed ? `${changed} changed from standard` : 'standard'}</span></div>
      <div className="seg sm" role="group" aria-label="Format" style={{ marginBottom: 8, maxWidth: 360 }}>
        {(['T20', 'ODI', 'Test'] as Fmt[]).map((f) => <button key={f} aria-pressed={fmt === f} onClick={() => setFmt(f)}>{f}</button>)}
      </div>
      <div className="cols-2" style={{ gap: 16 }}>
        {FIELDS.map(([group, rows]) => (
          <div key={group}>
            <p className="k" style={{ fontWeight: 700, margin: '8px 0 2px' }}>{group}</p>
            {rows.map(([k, label]) => (
              <div key={k} className="rule"><p className="k">{label}</p>
                <input className="num-in" type="number" step={1} value={val(k)} aria-label={`${fmt} ${label}`} onChange={(e) => set(k, Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))))} /></div>
            ))}
          </div>
        ))}
      </div>
      <p className="help" style={{ marginTop: 8 }}>
        {fmt === 'Test' ? 'Tests have no economy or strike-rate points.' : `Economy (from ${DEFAULT_RULES[fmt].econMinOvers} overs) and strike rate (from ${DEFAULT_RULES[fmt].srMinBalls} balls, not bowlers) use the standard ${fmt} bands.`}
        {' '}Captain and vice-captain multipliers are in Fantasy XI team above.
      </p>
      <div className="btn-row" style={{ marginTop: 10 }}>
        {changed > 0 && <button className="btn sm" onClick={() => setCustom((c) => ({ ...c, [fmt]: {} }))}><span>Back to standard {fmt}</span></button>}
        <button className="btn sm primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <span>Save points</span>}</button>
      </div>
    </section>
  )
}
