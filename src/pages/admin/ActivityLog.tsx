import { useEffect, useState } from 'react'
import { Empty } from '../../components/Empty'
import { Shell } from '../../components/Shell'
import { istDayName, istTime } from '../../lib/ist'
import { supabase } from '../../lib/supabase'
import { SkRows } from '../../components/Skeleton'

interface Row { id: number; actor_id: string | null; area: string; action: string; detail: Record<string, unknown>; created_at: string; who: { name: string } | null }
const AREAS = ['all', 'money', 'games', 'members', 'matches', 'settings', 'auto'] as const
/** Actions from the old wallet (before Pro11 moved to the ledger) keep their history under one label. */
const OLD_WALLET = new Set(['approve_topup', 'reject_topup', 'pay_withdrawal', 'reject_withdrawal', 'adjust_wallet', 'submit_topup', 'request_withdrawal'])
const NICE: Record<string, string> = {
  settle_contest: 'Finished a game', auto_settle: 'Finished a game automatically', cancel_contest: 'Cancelled a game',
  drop_no_data: 'Removed a league (no data)', set_visibility: 'Changed a match’s visibility', unblock_series: 'Brought a league back',
  update_money: 'Changed money settings', update_games: 'Changed game rules', update_team_rules: 'Changed Fantasy team rules',
  update_cricket_data: 'Changed cricket data settings', data_options: 'Changed credit-saving options',
}

/** Every money movement, game decision and settings change, newest first. */
export function ActivityLog() {
  const [area, setArea] = useState<(typeof AREAS)[number]>('all')
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    setRows(null)
    let q = supabase.from('audit_log').select('*, who:profiles!audit_log_actor_id_fkey(name)').order('created_at', { ascending: false }).limit(200)
    if (area !== 'all') q = q.eq('area', area)
    void q.then(({ data }) => setRows((data as Row[] | null) ?? []))
  }, [area])
  const summary = (r: Row) => {
    const d = r.detail ?? {}
    const bits = ['amount', 'member', 'reason', 'pot', 'winners', 'refunded', 'games_refunded'].filter((k) => d[k] !== undefined && d[k] !== null).map((k) => `${k.replace('_', ' ')}: ${String(d[k])}`)
    return bits.join(', ')
  }
  return (
    <Shell title="Activity log" back="/admin">
      <div className="chips" role="group" aria-label="Area" style={{ width: 'fit-content', maxWidth: '100%' }}>
        {AREAS.map((a) => <button key={a} className="chip" aria-pressed={area === a} onClick={() => setArea(a)}>{a === 'all' ? 'All' : a === 'auto' ? 'Automatic' : a[0].toUpperCase() + a.slice(1)}</button>)}
      </div>
      {!rows && <div style={{ marginTop: 12 }}><SkRows n={6} avatar={false} /></div>}
      {rows && rows.length === 0 && <Empty icon="log" title="Nothing here yet" />}
      <div className="list" style={{ marginTop: 12, maxWidth: 820 }}>
        {(rows ?? []).map((r) => (
          <div key={r.id} className="row nolead" style={{ gridTemplateColumns: '1fr auto' }}>
            <span style={{ minWidth: 0 }}>
              <span className="rt">{OLD_WALLET.has(r.action) ? 'Wallet (removed)' : NICE[r.action] ?? r.action.replace(/_/g, ' ')}</span>
              <span className="rs">{r.who?.name ?? 'Pro11 (automatic)'}{summary(r) ? ` · ${summary(r)}` : ''}</span>
            </span>
            <span className="help num" style={{ whiteSpace: 'nowrap' }}>{istDayName(r.created_at)} {istTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </Shell>
  )
}
