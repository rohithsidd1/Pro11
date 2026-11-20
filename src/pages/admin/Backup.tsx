import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'

const TABLES = ['profiles', 'ledger_lines', 'settlements', 'contests', 'entries', 'xi_picks', 'fantasy_picks', 'matches', 'match_players', 'player_points', 'app_settings', 'audit_log'] as const

/** One-click backup of everything the admin can read, as a single JSON file. */
export function Backup() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      const out: Record<string, unknown[]> = {}
      for (const t of TABLES) {
        const rows: unknown[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from(t).select('*').range(from, from + 999)
          if (error) throw new Error(`${t}: ${error.message}`)
          rows.push(...(data ?? []))
          if (!data || data.length < 1000) break
        }
        out[t] = rows
      }
      const blob = new Blob([JSON.stringify({ app: 'Pro11', exported_at: new Date().toISOString(), tables: out }, null, 1)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `pro11-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
      URL.revokeObjectURL(a.href)
      toast('Backup downloaded')
    } catch (e) { toast(e instanceof Error ? e.message : 'Backup failed') } finally { setBusy(false) }
  }
  return (
    <Shell title="Backup" back="/admin">
      <section className="panel" style={{ maxWidth: 640 }}>
        <p className="rt">Download everything</p>
        <p className="help" style={{ marginTop: 6 }}>Members, the ledger (who owes whom) and every payment recorded, games, picks, matches, settings and the activity log, in one JSON file. Screenshots stay in storage. Keep the file private: it has phone numbers and money records.</p>
        <button className="btn primary" style={{ marginTop: 16 }} disabled={busy} onClick={download}>{busy ? <span className="spinner" /> : <><Icon name="down" /><span>Download backup</span></>}</button>
        <p className="help" style={{ marginTop: 12 }}>For a spreadsheet of money only, use Balances → Export.</p>
      </section>
    </Shell>
  )
}
