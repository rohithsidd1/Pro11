import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { PointsRules } from '../../components/PointsRules'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { GameSettings, TeamRules } from '../../lib/types'

type Fmt = 'T20' | 'ODI' | 'Test'
interface Extra {
  fees: Record<Fmt | 'Other', { xi: number; fantasy: number }>; open_xi: boolean; open_fantasy: boolean; max_players: number
  payout_mode: 'winner' | 'top2'; bonus_join: number; bonus_win: number; bonus_second: number; bonus_perfect: number
  bonus_reset: 'month' | 'year' | 'never'; show_bonus: boolean; fx_ruleset: number; full_scorecard: boolean
}

export function GameRules() {
  const isCb = ((useAuth().settings as unknown as { data_source?: string })?.data_source ?? 'cricbuzz') === 'cricbuzz'
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const [f, setF] = useState<GameSettings | null>(null)
  const [t, setT] = useState<TeamRules | null>(null)
  const [x, setX] = useState<Extra | null>(null)
  const [fmt, setFmt] = useState<Fmt>('T20')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!settings) return
    const all = settings as unknown as GameSettings & TeamRules & Extra
    setF(all); setT(all)
    setX({ fees: all.fees ?? { T20: { xi: 20, fantasy: 50 }, ODI: { xi: 20, fantasy: 50 }, Test: { xi: 20, fantasy: 50 }, Other: { xi: 20, fantasy: 50 } },
      open_xi: all.open_xi ?? true, open_fantasy: all.open_fantasy ?? true, max_players: all.max_players ?? 10, payout_mode: all.payout_mode ?? 'winner',
      bonus_join: all.bonus_join ?? 5, bonus_win: all.bonus_win ?? 50, bonus_second: all.bonus_second ?? 20, bonus_perfect: all.bonus_perfect ?? 25,
      bonus_reset: all.bonus_reset ?? 'month', show_bonus: all.show_bonus ?? true, fx_ruleset: all.fx_ruleset ?? 0, full_scorecard: all.full_scorecard ?? false })
  }, [settings])
  if (!f || !t || !x) return <Shell title="Game rules" back="/admin"><p className="help">Loading…</p></Shell>
  const setFee = (game: 'xi' | 'fantasy', v: number) => setX({ ...x, fees: { ...x.fees, [fmt]: { ...x.fees[fmt], [game]: v }, ...(fmt === 'T20' ? { Other: { ...x.fees.Other, [game]: v } } : {}) } })
  const XNum = ({ k, label, sub, min = 0, max = 1000 }: { k: 'max_players' | 'bonus_join' | 'bonus_win' | 'bonus_second' | 'bonus_perfect' | 'fx_ruleset'; label: string; sub?: string; min?: number; max?: number }) => (
    <div className="rule"><div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <input className="num-in" type="number" min={min} max={max} value={x[k]} aria-label={label} onChange={(e) => setX({ ...x, [k]: Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))) })} />
    </div>
  )
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setF({ ...f, [k]: v })

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_update_game_settings', {
      p_points_per_correct: f.xi_points_per_correct, p_perfect_bonus: f.xi_perfect_team_bonus, p_both_bonus: f.xi_both_perfect_bonus,
      p_lock_at: f.xi_lock_at, p_toss_minutes: f.toss_minutes_before, p_tie_rule: f.tie_rule,
      p_fee_xi: f.default_fee_xi, p_fee_fantasy: f.default_fee_fantasy, p_min_players: f.min_players,
    })
    if (error) { setBusy(false); return toast(errorText(error)) }
    const { error: e2 } = await supabase.rpc('admin_update_team_rules', {
      p_max_per_side: t.fx_max_per_side, p_wk_min: t.fx_wk_min, p_wk_max: t.fx_wk_max, p_bat_min: t.fx_bat_min, p_bat_max: t.fx_bat_max,
      p_ar_min: t.fx_ar_min, p_ar_max: t.fx_ar_max, p_bowl_min: t.fx_bowl_min, p_bowl_max: t.fx_bowl_max,
      p_captain: t.fx_captain_mult, p_vice: t.fx_vice_mult, p_live: t.fx_live_update,
    })
    if (e2) { setBusy(false); return toast(errorText(e2)) }
    const { error: e3 } = await supabase.from('app_settings').update({
      fees: x.fees, open_xi: x.open_xi, open_fantasy: x.open_fantasy, max_players: x.max_players, payout_mode: x.payout_mode,
      bonus_join: x.bonus_join, bonus_win: x.bonus_win, bonus_second: x.bonus_second, bonus_perfect: x.bonus_perfect,
      bonus_reset: x.bonus_reset, show_bonus: x.show_bonus, fx_ruleset: x.fx_ruleset, full_scorecard: x.full_scorecard,
      default_fee_xi: x.fees.T20.xi, default_fee_fantasy: x.fees.T20.fantasy,
    } as never).eq('id', 1)
    setBusy(false)
    if (e3) return toast(errorText(e3))
    await refresh(); toast('Saved. New games use these; games already open keep theirs.')
  }
  const Num = ({ k, label, sub, min = 0, max = 1000, pre }: { k: keyof GameSettings; label: string; sub?: string; min?: number; max?: number; pre?: string }) => (
    <div className="rule"><div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{pre && <span className="help num">{pre}</span>}
        <input className="num-in" type="number" min={min} max={max} value={Number(f[k])} aria-label={label}
          onChange={(e) => set(k, Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))) as never)} /></span>
    </div>
  )
  const TNum = ({ k, label, min, max, step = 1 }: { k: keyof TeamRules; label: string; min: number; max: number; step?: number }) => (
    <div className="rule"><p className="k">{label}</p>
      <input className="num-in" type="number" min={min} max={max} step={step} value={Number(t[k])} aria-label={label}
        onChange={(e) => setT({ ...t, [k]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })} />
    </div>
  )
  const Range = ({ label, lo, hi }: { label: string; lo: keyof TeamRules; hi: keyof TeamRules }) => (
    <div className="rule"><p className="k">{label}</p>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input className="num-in" style={{ width: 64 }} type="number" min={0} max={11} value={Number(t[lo])} aria-label={`${label} minimum`} onChange={(e) => setT({ ...t, [lo]: Math.max(0, Math.min(11, Number(e.target.value) || 0)) })} />
        <span className="help">to</span>
        <input className="num-in" style={{ width: 64 }} type="number" min={0} max={11} value={Number(t[hi])} aria-label={`${label} maximum`} onChange={(e) => setT({ ...t, [hi]: Math.max(0, Math.min(11, Number(e.target.value) || 0)) })} />
      </span>
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
          <div className="seg sm" role="group" aria-label="Format" style={{ marginBottom: 6 }}>
            {(['T20', 'ODI', 'Test'] as Fmt[]).map((v) => <button key={v} aria-pressed={fmt === v} onClick={() => setFmt(v)}>{v}</button>)}
          </div>
          <div className="rule"><div><p className="k">Predict the XI entry</p><p className="s">New {fmt} games</p></div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="help num">₹</span><input className="num-in" type="number" min={0} value={x.fees[fmt].xi} aria-label="Predict the XI entry" onChange={(e) => setFee('xi', Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></span></div>
          <div className="rule"><div><p className="k">Fantasy XI entry</p><p className="s">New {fmt} games</p></div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="help num">₹</span><input className="num-in" type="number" min={0} value={x.fees[fmt].fantasy} aria-label="Fantasy XI entry" onChange={(e) => setFee('fantasy', Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></span></div>
          <label className="rule" style={{ cursor: 'pointer' }}><p className="k">Open Predict the XI on new matches</p><input type="checkbox" role="switch" className="switch" checked={x.open_xi} onChange={(e) => setX({ ...x, open_xi: e.target.checked })} /></label>
          <label className="rule" style={{ cursor: 'pointer' }}><p className="k">Open Fantasy XI on new matches</p><input type="checkbox" role="switch" className="switch" checked={x.open_fantasy} onChange={(e) => setX({ ...x, open_fantasy: e.target.checked })} /></label>
          <Num k="min_players" label="Fewest players to run" sub="Fewer at the lock: cancelled and refunded" min={2} max={100} />
          <XNum k="max_players" label="Most players in a game" min={2} max={100} />
          <div className="rule stacked"><p className="k">Payout</p>
            <div className="seg sm"><button aria-pressed={x.payout_mode === 'winner'} onClick={() => setX({ ...x, payout_mode: 'winner' })}>Winner takes all</button><button aria-pressed={x.payout_mode === 'top2'} onClick={() => setX({ ...x, payout_mode: 'top2' })}>Top 2 split 70/30</button></div>
            <p className="help">Top 2 needs 3 or more players and a clear winner; otherwise the top group shares the pot.</p></div>
          <div className="rule stacked"><p className="k">If tied for first</p>
            <div className="seg sm">{(['split', 'earliest'] as const).map((v) => <button key={v} aria-pressed={f.tie_rule === v} onClick={() => set('tie_rule', v)}>{v === 'split' ? 'Split equally' : 'Earliest entry'}</button>)}</div></div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 8 }}>
        <div className="ch"><h3>Fantasy XI team</h3></div>
        <div className="cols-2" style={{ gap: 16 }}>
          <div>
            <TNum k="fx_max_per_side" label="Most from one team" min={6} max={11} />
            <Range label="Wicketkeepers" lo="fx_wk_min" hi="fx_wk_max" />
            <Range label="Batters" lo="fx_bat_min" hi="fx_bat_max" />
            <Range label="All-rounders" lo="fx_ar_min" hi="fx_ar_max" />
            <Range label="Bowlers" lo="fx_bowl_min" hi="fx_bowl_max" />
          </div>
          <div>
            <TNum k="fx_captain_mult" label="Captain multiplier" min={1} max={5} step={0.5} />
            <TNum k="fx_vice_mult" label="Vice-captain multiplier" min={1} max={5} step={0.5} />
            {!isCb && <>
            <label className="rule" style={{ cursor: 'pointer' }}>
              <div><p className="k">Live points during the match</p><p className="s">One update around the innings break, 10 credits a game</p></div>
              <input type="checkbox" role="switch" className="switch" checked={t.fx_live_update} onChange={(e) => setT({ ...t, fx_live_update: e.target.checked })} />
            </label>
            <XNum k="fx_ruleset" label="CricketData points ruleset" sub="0 = their standard rules. Make your own in your CricketData member area and enter its number." max={100000} />
            <label className="rule" style={{ cursor: 'pointer' }}>
              <div><p className="k">Full scorecard after the match</p><p className="s">Batting and bowling card, 10 credits a match. Off: totals and top performers only (free).</p></div>
              <input type="checkbox" role="switch" className="switch" checked={x.full_scorecard} onChange={(e) => setX({ ...x, full_scorecard: e.target.checked })} />
            </label>
            </>}
          </div>
        </div>
      </section>
      <PointsRules />
      <section className="panel" style={{ marginTop: 8 }}>
        <div className="ch"><h3>Bonus points</h3><span className="help">leaderboard only, never money</span></div>
        <div className="cols-2" style={{ gap: 16 }}>
          <div>
            <XNum k="bonus_win" label="Win a game" />
            <XNum k="bonus_second" label="Come 2nd" />
            <XNum k="bonus_perfect" label="Perfect XI, one team" sub="Predict the XI" />
            <XNum k="bonus_join" label="Join a game" sub="Counted once the game finishes" />
          </div>
          <div>
            <div className="rule stacked"><p className="k">Resets</p>
              <div className="seg sm">{(['month', 'year', 'never'] as const).map((v) => <button key={v} aria-pressed={x.bonus_reset === v} onClick={() => setX({ ...x, bonus_reset: v })}>{v === 'month' ? 'Monthly' : v === 'year' ? 'Yearly' : 'Never'}</button>)}</div></div>
            <label className="rule" style={{ cursor: 'pointer' }}><p className="k">Show bonus points on Ranks</p><input type="checkbox" role="switch" className="switch" checked={x.show_bonus} onChange={(e) => setX({ ...x, show_bonus: e.target.checked })} /></label>
          </div>
        </div>
      </section>
      <button className="btn primary" style={{ marginTop: 20, minWidth: 220 }} disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Save rules</span></>}</button>
    </Shell>
  )
}
