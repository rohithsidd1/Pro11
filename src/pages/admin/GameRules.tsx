import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { GameSettings } from '../../lib/types'

export function GameRules() {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const [f, setF] = useState<GameSettings | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (settings) setF(settings as unknown as GameSettings) }, [settings])
  if (!f) return <Shell title="Game rules" back="/admin"><p className="help">Loading…</p></Shell>
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setF({ ...f, [k]: v })

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_update_game_settings', {
      p_points_per_correct: f.xi_points_per_correct, p_perfect_bonus: f.xi_perfect_team_bonus, p_both_bonus: f.xi_both_perfect_bonus,
      p_lock_at: f.xi_lock_at, p_toss_minutes: f.toss_minutes_before, p_tie_rule: f.tie_rule,
      p_fee_xi: f.default_fee_xi, p_fee_fantasy: f.default_fee_fantasy, p_min_players: f.min_players,
    })
    setBusy(false)
    if (error) return toast(errorText(error))
    await refresh(); toast('Saved. Open games use the new lock time; scores use the new points next time they’re scored.')
  }
  const Num = ({ k, label, sub, min = 0, max = 1000, pre }: { k: keyof GameSettings; label: string; sub?: string; min?: number; max?: number; pre?: string }) => (
    <div className="rule"><div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{pre && <span className="help num">{pre}</span>}
        <input className="num-in" type="number" min={min} max={max} value={Number(f[k])} aria-label={label}
          onChange={(e) => set(k, Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))) as never)} /></span>
    </div>
  )
  return (
    <Shell title="Game rules" back="/admin">
      <div className="cols-2">
        <section className="panel">
          <div className="ch"><h3>Predict the XI</h3></div>
          <Num k="xi_points_per_correct" label="Points per correct player" />
          <Num k="xi_perfect_team_bonus" label="Perfect team bonus" sub="All 11 right for one side" />
          <Num k="xi_both_perfect_bonus" label="Both teams perfect" sub="On top of the two team bonuses" />
          <div className="rule stacked"><p className="k">Picks lock at</p>
            <div className="seg sm">{(['toss', 'start'] as const).map((v) => <button key={v} aria-pressed={f.xi_lock_at === v} onClick={() => set('xi_lock_at', v)}>{v === 'toss' ? 'Toss' : 'Start'}</button>)}</div></div>
          <Num k="toss_minutes_before" label="Toss is this long before the start" sub="Minutes" max={180} />
        </section>
        <section className="panel">
          <div className="ch"><h3>All games</h3></div>
          <Num k="default_fee_xi" label="Predict the XI entry" sub="For new games" pre="₹" max={100000} />
          <Num k="default_fee_fantasy" label="Fantasy XI entry" sub="For new games" pre="₹" max={100000} />
          <Num k="min_players" label="Fewest players to run" sub="Fewer at the lock: cancelled and refunded" min={2} max={100} />
          <div className="rule stacked"><p className="k">If tied for first</p>
            <div className="seg sm">{(['split', 'earliest'] as const).map((v) => <button key={v} aria-pressed={f.tie_rule === v} onClick={() => set('tie_rule', v)}>{v === 'split' ? 'Split equally' : 'Earliest entry'}</button>)}</div></div>
        </section>
      </div>
      <button className="btn primary" style={{ marginTop: 20, minWidth: 220 }} disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Save rules</span></>}</button>
    </Shell>
  )
}
