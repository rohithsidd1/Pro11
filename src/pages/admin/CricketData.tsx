import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { callFunction, errorText } from '../../lib/api'
import { istDayName, istTime } from '../../lib/ist'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { DataSettings } from '../../lib/types'
import { useDataStatus } from '../../lib/useDataSettings'

const ENDPOINT: Record<string, string> = {
  currentMatches: 'Match list', matches: 'Upcoming fixtures', match_info: 'Match details', match_squad: 'Match squad', series_squad: 'Series squad', match_points: 'Fantasy points',
}

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

  const setOption = async (only: boolean, autoXi: boolean) => {
    const { error } = await supabase.rpc('admin_set_data_options', { p_only_game_ready: only, p_auto_xi_check: autoXi })
    if (error) return toast(errorText(error))
    toast('Saved'); void reload()
  }

  const sync = async (mode: 'list' | 'fixtures') => {
    setBusy(mode)
    try {
      const r = await callFunction<{ result: { saved: number } }>('sync-cricket', { mode })
      toast(`${r.result.saved} matches updated`)
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
              <button className="btn sm" disabled={!!busy} onClick={() => sync('fixtures')}>{busy === 'fixtures' ? <span className="spinner" /> : <Icon name="down" small />}<span>Load fixtures</span></button>
            </div>
            <p className="help" style={{ marginTop: 10 }}>
              Last match list: {settings?.last_list_sync_at ? `${istDayName(settings.last_list_sync_at)} ${istTime(settings.last_list_sync_at)}` : 'never'}.
              {' '}Last fixtures: {settings?.last_fixtures_sync_at ? `${istDayName(settings.last_fixtures_sync_at)} ${istTime(settings.last_fixtures_sync_at)}` : 'never'}.
            </p>
          </section>

          {form && (
            <section className="panel" style={{ marginTop: 8 }}>
              <div className="ch"><h3>Syncing</h3></div>
              <NumberRule k="daily_credit_cap" label="Daily credit limit" sub="Stops automatic and manual syncing here" min={1} max={100000} />
              <NumberRule k="list_refresh_hours" label="Refresh the match list every" sub="About 1–2 credits each time" min={1} max={24} unit="hrs" />
              <NumberRule k="fixtures_refresh_hours" label="Load upcoming fixtures every" sub="1 credit per page" min={1} max={48} unit="hrs" />
              <NumberRule k="fixtures_pages" label="Fixture pages each time" sub="0 turns fixtures off" min={0} max={5} />
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
