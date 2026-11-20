import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { SkPanel } from '../../components/Skeleton'

interface F { code_length: number; code_ttl_minutes: number; session_days: number; code_requests_per_hour: number; members_only_codes: boolean }

export function SignInSettings() {
  const { settings, refresh } = useAuth()
  const toast = useToast()
  const [f, setF] = useState<F | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (settings) setF(settings as unknown as F) }, [settings])
  if (!f) return <Shell title="Sign-in settings" back="/admin"><SkPanel lines={6} /></Shell>
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('app_settings').update({
      code_length: f.code_length, code_ttl_minutes: f.code_ttl_minutes, session_days: f.session_days,
      code_requests_per_hour: f.code_requests_per_hour, members_only_codes: f.members_only_codes,
    }).eq('id', 1)
    setBusy(false)
    if (error) return toast(errorText(error))
    await refresh(); toast('Saved')
  }
  const Num = ({ k, label, sub, min, max }: { k: keyof F; label: string; sub?: string; min: number; max: number }) => (
    <div className="rule"><div><p className="k">{label}</p>{sub && <p className="s">{sub}</p>}</div>
      <input className="num-in" type="number" min={min} max={max} value={Number(f[k])} aria-label={label}
        onChange={(e) => setF({ ...f, [k]: Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || min))) })} />
    </div>
  )
  return (
    <Shell title="Sign-in settings" back="/admin">
      <section className="panel" style={{ maxWidth: 640 }}>
        <Num k="code_length" label="Code length" sub="Digits in a sign-in code" min={4} max={8} />
        <Num k="code_ttl_minutes" label="Code works for" sub="Minutes" min={1} max={30} />
        <Num k="session_days" label="Stay signed in for" sub="Days" min={1} max={365} />
        <Num k="code_requests_per_hour" label="Code requests per hour" sub="Per phone number" min={1} max={20} />
        <label className="rule" style={{ cursor: 'pointer' }}>
          <div><p className="k">Members only</p><p className="s">Only phone numbers already in Members can ask for a code</p></div>
          <input type="checkbox" role="switch" className="switch" checked={f.members_only_codes} onChange={(e) => setF({ ...f, members_only_codes: e.target.checked })} />
        </label>
        <button className="btn primary" style={{ marginTop: 16 }} disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Save</span></>}</button>
      </section>
    </Shell>
  )
}
