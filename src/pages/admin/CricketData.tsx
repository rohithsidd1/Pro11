import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { callFunction, errorText } from '../../lib/api'
import { istDayName, istTime } from '../../lib/ist'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { DataSettings } from '../../lib/types'
import { useDataStatus } from '../../lib/useDataSettings'
import { useSettingsForm } from '../../lib/useSettingsForm'
import { reportSummary, useMatchReport } from '../../components/MatchReport'
import { Link } from 'react-router-dom'

const ENDPOINT: Record<string, string> = {
  currentMatches: 'Match list', matches: 'Fixtures (old)', series_info: 'Series schedule', match_info: 'Match details', match_squad: 'Match squad', series_squad: 'Series squad', match_points: 'Fantasy points',
}

const hrs = (h: number) => (Math.abs(h) >= 48 ? `${Math.round(h / 24)} d` : `${Math.round(h)} h`)

export function CricketData() {
  const toast = useToast()
  const { settings, usage, calls, used, reload } = useDataStatus()
  const [form, setForm] = useState<DataSettings | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { if (settings) setForm(settings) }, [settings])

  const cap = settings?.daily_credit_cap ?? 90
  const pct = Math.min(100, Math.round((used / cap) * 100))
  const set = <K extends keyof DataSettings>(k: K, v: DataSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const save = async () => {
    if (!form) return
    setBusy('save')
    const { error } = await supabase.rpc('admin_update_data_settings', {
      p_daily_credit_cap: form.daily_credit_cap, p_list_refresh_hours: form.list_refresh_hours,
      p_fixtures_refresh_hours: form.fixtures_refresh_hours, p_fixtures_pages: form.fixtures_pages,
      p_show_men_intl: form.show_men_intl, p_show_women_intl: form.show_women_intl, p_show_leagues: form.show_leagues,
      p_show_domestic: form.show_domestic, p_sync_paused: form.sync_paused,
    })
    setBusy(null)
    if (error) return toast(errorText(error))
    toast('Saved'); void reload()
  }

  const [leads, setLeads] = useState<{ series: string; category: string; matches: number; typical_hours: number; earliest_hours: number; latest_hours: number }[]>([])
  useEffect(() => { void supabase.rpc('squad_lead_times', { p_days: 30 }).then(({ data }) => setLeads((data as never) ?? [])) }, [])
  const [blocked, setBlocked] = useState<{ series_id: string; reason: string; blocked_at: string; name?: string }[]>([])
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('blocked_series').select('*').order('blocked_at', { ascending: false })
      const rows = (data ?? []) as { series_id: string; reason: string; blocked_at: string }[]
      const { data: ms } = rows.length ? await supabase.from('matches').select('series_id, series_name').in('series_id', rows.map((r) => r.series_id)) : { data: [] }
      setBlocked(rows.map((r) => ({ ...r, name: (ms ?? []).find((m: { series_id: string }) => m.series_id === r.series_id)?.series_name ?? undefined })))
    })()
  }, [calls.length])
  const unblock = async (sid: string) => {
    const { error } = await supabase.rpc('admin_unblock_series', { p_series: sid })
    if (error) return toast(errorText(error))
    setBlocked((b) => b.filter((x) => x.series_id !== sid)); toast('Brought back. Squads load again when someone joins.')
  }

  const report = useMatchReport()
  const setOption = async (only: boolean, autoXi: boolean) => {
    const { error } = await supabase.rpc('admin_set_data_options', { p_only_game_ready: only, p_auto_xi_check: autoXi })
    if (error) return toast(errorText(error))
    toast('Saved'); void reload()
  }

  const sync = async (mode: 'list' | 'fixtures') => {
    setBusy(mode)
    try {
      const r = await callFunction<{ result: { saved: number; pages?: number; series?: number } }>('sync-cricket', { mode })
      await report.reload()
      toast(mode === 'list' ? `${r.result.saved} matches from ${r.result.pages ?? 0} pages. See “What members see” for each one.` : `${r.result.saved} upcoming matches from ${r.result.series ?? 0} series`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t sync') } finally { setBusy(null); void reload() }
  }

  const Toggle = ({ k, label, sub }: { k: keyof DataSettings; label: string; sub?: string }) => (
    <label className="rule" style={{ cursor: 'pointer' }}>
      <div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <input type="checkbox" role="switch" className="switch" checked={Boolean(form?.[k])} onChange={(e) => set(k, e.target.checked as never)} />
    </label>
  )
  const NumberRule = ({ k, label, sub, min, max, unit }: { k: keyof DataSettings; label: string; sub?: string; min: number; max: number; unit?: string }) => (
    <div className="rule">
      <div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input className="num-in" type="number" min={min} max={max} value={Number(form?.[k] ?? 0)} aria-label={label}
          onChange={(e) => set(k, Math.max(min, Math.min(max, Number(e.target.value) || min)) as never)} />
        {unit && <span className="help num">{unit}</span>}
      </span>
    </div>
  )

  return (
    <Shell title="Cricket data" kicker="API and syncing">
      <div className="cols-2">
        <div>
          <section className="panel">
            <p className="rt">API credits today</p>
            <div className="bigmeter" style={{ marginTop: 8 }}><span className="v">{used}</span><span className="of">/ {cap}</span></div>
            <span className={pct >= 85 ? 'meter warn' : 'meter'} style={{ marginTop: 12 }}><i style={{ width: `${pct}%` }} /></span>
            <p className="help" style={{ marginTop: 10 }}>
              Automatic syncing stops at your limit. The API itself allows <span className="num">{usage?.hits_limit ?? 100}</span> a day and resets its count once a day.
            </p>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button className="btn sm" disabled={!!busy} onClick={() => sync('list')}>{busy === 'list' ? <span className="spinner" /> : <Icon name="refresh" small />}<span>Refresh match list</span></button>
              <button className="btn sm" disabled={!!busy} onClick={() => sync('fixtures')}>{busy === 'fixtures' ? <span className="spinner" /> : <Icon name="down" small />}<span>Load schedules</span></button>
            </div>
            <p className="help" style={{ marginTop: 10 }}>
              Last match list: {settings?.last_list_sync_at ? `${istDayName(settings.last_list_sync_at)} ${istTime(settings.last_list_sync_at)}` : 'never'}.
              {' '}Last schedules: {settings?.last_fixtures_sync_at ? `${istDayName(settings.last_fixtures_sync_at)} ${istTime(settings.last_fixtures_sync_at)}` : 'never'}.
            </p>
          </section>

          {form && (
            <section className="panel" style={{ marginTop: 8 }}>
              <div className="ch"><h3>Syncing</h3></div>
              <NumberRule k="daily_credit_cap" label="Daily credit limit" sub="Stops automatic and manual syncing here" min={1} max={100000} />
              <NumberRule k="list_refresh_hours" label="Refresh the match list every" sub="Live, recent and starting-soon matches; 1 credit per 25 matches" min={1} max={24} unit="hrs" />
              <NumberRule k="fixtures_refresh_hours" label="Load series schedules every" sub="Tomorrow’s and later matches of the series being played" min={1} max={48} unit="hrs" />
              <NumberRule k="fixtures_pages" label="Series schedules each time" sub="1 credit per series; 0 turns schedules off" min={0} max={20} />
              <Toggle k="sync_paused" label="Pause all syncing" sub="Nothing is fetched until you turn this off" />
              <div className="ch" style={{ marginTop: 18 }}><h3>Save credits</h3></div>
              <label className="rule" style={{ cursor: 'pointer' }}>
                <div><p className="k">Only matches with game data</p><p className="s">Hide matches CricketData has no squad or fantasy data for. They appear once it does.</p></div>
                <input type="checkbox" role="switch" className="switch" checked={settings?.only_game_ready ?? true} onChange={(e) => setOption(e.target.checked, settings?.auto_xi_check ?? false)} />
              </label>
              <label className="rule" style={{ cursor: 'pointer' }}>
                <div><p className="k">Get the Playing XI automatically</p><p className="s">About 10 credits per game after the toss, and 10 more after the match if needed. Off: Predict the XI games refund themselves.</p></div>
                <input type="checkbox" role="switch" className="switch" checked={settings?.auto_xi_check ?? false} onChange={(e) => setOption(settings?.only_game_ready ?? true, e.target.checked)} />
              </label>
              <LiveScores />
              <div className="ch" style={{ marginTop: 18 }}><h3>Which matches to show</h3></div>
              <Toggle k="show_men_intl" label="Men’s internationals" />
              <Toggle k="show_women_intl" label="Women’s internationals" />
              <Toggle k="show_leagues" label="IPL and other leagues" />
              <Toggle k="show_domestic" label="Domestic and others" />
              <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy === 'save'} onClick={save}>
                {busy === 'save' ? <span className="spinner" /> : <span>Save changes</span>}
              </button>
            </section>
          )}
        </div>

        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
        {blocked.length > 0 && (
          <section className="panel">
            <div className="ch"><h3>Leagues removed</h3><span className="help">no data from CricketData</span></div>
            <div className="list">
              {blocked.map((b) => (
                <div key={b.series_id} className="row nolead" style={{ background: 'var(--sand)', gridTemplateColumns: '1fr auto' }}>
                  <span><span className="rt">{b.name ?? 'A league'}</span><span className="rs">Removed {istDayName(b.blocked_at).toLowerCase()} {istTime(b.blocked_at)}</span></span>
                  <button className="btn sm" onClick={() => unblock(b.series_id)}><span>Bring back</span></button>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="panel">
          <div className="ch"><h3>What members see</h3><Link className="textlink" style={{ minHeight: 0 }} to="/admin/matches">Every match and why</Link></div>
          {!report.rows ? <p className="help">Loading…</p> : report.rows.length === 0 ? <p className="help">No matches yet. Tap Refresh match list.</p> : (
            <div className="list">
              {reportSummary(report.rows).map((x) => (
                <div key={x.reason} className="read"><span className="k">{x.reason === 'Shown' ? <b>Members see them</b> : x.reason}</span><span className="v">{x.n}</span></div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="ch"><h3>How early squads appear</h3><span className="help">last 30 days</span></div>
          {leads.length === 0
            ? <p className="help">Builds up by itself. Each time CricketData first marks a match as having a squad, Pro11 notes the time (no credits). Accurate to within one list refresh.</p>
            : (
              <div className="tscroll">
                <table className="wtable">
                  <thead><tr><th scope="col">Series</th><th scope="col" className="r">Matches</th><th scope="col" className="r">Typical</th><th scope="col" className="r">Range</th></tr></thead>
                  <tbody>{leads.map((l) => (
                    <tr key={l.series + l.category}><td><span style={{ fontWeight: 600 }}>{l.series}</span><br /><span className="help">{l.category}</span></td>
                      <td className="r num">{l.matches}</td><td className="r num">{hrs(l.typical_hours)} before</td><td className="r num">{hrs(l.latest_hours)}–{hrs(l.earliest_hours)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </section>
        <section className="panel">
          <div className="ch"><h3>Recent API calls</h3><span className="help">newest first</span></div>
          {calls.length === 0 ? <p className="help">No calls yet. Tap Refresh match list to make the first one.</p> : (
            <div className="tscroll">
              <table className="wtable">
                <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col" className="r">Credits</th></tr></thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{istTime(c.at)}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{ENDPOINT[c.endpoint] ?? c.endpoint}</span>
                        {c.trigger === 'admin' && <span className="help"> by you</span>}
                        {(c.note || !c.ok) && <span className="rs" style={{ color: c.ok ? undefined : 'var(--bad)' }}>{c.note ?? 'Failed'}</span>}
                      </td>
                      <td className="r num">{c.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </div>
    </Shell>
  )
}

function LiveScores() {
  const { f, set, save, busy } = useSettingsForm<{ live_scores: boolean; live_score_minutes: number }>(['live_scores', 'live_score_minutes'])
  if (!f) return null
  const t20 = Math.ceil(210 / f.live_score_minutes), odi = Math.ceil(510 / (f.live_score_minutes * 2))
  return (
    <>
      <div className="ch" style={{ marginTop: 18 }}><h3>Live scores</h3></div>
      <label className="rule" style={{ cursor: 'pointer' }}>
        <div><p className="k">Live scores for joined matches</p><p className="s">1 credit per update, only while a match someone joined is being played. Also spots the finish sooner.</p></div>
        <input type="checkbox" role="switch" className="switch" checked={f.live_scores} onChange={(e) => set('live_scores', e.target.checked)} />
      </label>
      <div className="rule"><div><p className="k">Update every</p><p className="s">T20s. ODIs every {f.live_score_minutes * 2} min, Tests every 6 hours. About {t20} credits a T20, {odi} an ODI.</p></div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input className="num-in" type="number" min={15} max={180} value={f.live_score_minutes} aria-label="Minutes between live updates" onChange={(e) => set('live_score_minutes', Math.max(15, Math.min(180, Math.floor(Number(e.target.value) || 30))))} />
          <span className="help">min</span></span></div>
      <button className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => save()}>{busy ? <span className="spinner" /> : <span>Save live scores</span>}</button>
    </>
  )
}
