import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CodeCard } from '../../components/CodeCard'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { useCodes } from '../../lib/useCodes'
import { useDataStatus } from '../../lib/useDataSettings'

export function AdminHome() {
  const { profile } = useAuth()
  const toast = useToast()
  const { waiting, reload } = useCodes()
  const { used, settings } = useDataStatus()
  const [members, setMembers] = useState(0)
  useEffect(() => {
    void supabase.from('profiles').select('id', { count: 'exact', head: true }).then(({ count }) => setMembers(count ?? 0))
  }, [])

  const signEveryoneOut = async () => {
    if (!window.confirm('Sign everyone out, including you? Everyone will need a new code.')) return
    const { error } = await supabase.rpc('admin_sign_everyone_out')
    toast(error ? 'Couldn’t sign everyone out.' : 'Everyone will be signed out on their next visit')
  }

  return (
    <Shell title={`Hi ${profile?.name.split(' ')[0] ?? ''}`} kicker="Admin" actions={<span className="admin-tag"><Icon name="shield" small /><span className="tx">Admin</span></span>}>
      <div className="tiles four">
        <Link to="/admin/codes" className="tile" style={{ ['--c' as string]: 'var(--lemon)' }}>
          <span className="tile-k">Sign-in codes waiting</span><span className="tile-v">{waiting.length}</span>
        </Link>
        <Link to="/admin/members" className="tile" style={{ ['--c' as string]: 'var(--blue)' }}>
          <span className="tile-k">Members</span><span className="tile-v">{members}</span>
        </Link>
        <div className="tile" style={{ ['--c' as string]: 'var(--soft)' }}>
          <span className="tile-k">Payments to check</span><span className="tile-v">–</span>
        </div>
        <Link to="/admin/data" className="tile" style={{ ['--c' as string]: 'var(--mint)' }}>
          <span className="tile-k">API credits today</span>
          <span>
            <span className="tile-v">{used}<span style={{ fontSize: 15, fontWeight: 500 }}>/{settings?.daily_credit_cap ?? 90}</span></span>
            <span className="meter" style={{ background: 'rgba(255,255,255,.6)', marginTop: 6 }}><i style={{ width: `${Math.min(100, (used / (settings?.daily_credit_cap ?? 90)) * 100)}%` }} /></span>
          </span>
        </Link>
      </div>

      {waiting.length > 0 && (
        <>
          <div className="sec"><h2>Sign-in codes</h2><Link to="/admin/codes" className="aside">See all</Link></div>
          <div className="list" style={{ maxWidth: 560 }}>{waiting.slice(0, 2).map((r) => <CodeCard key={r.id} req={r} onChange={reload} />)}</div>
        </>
      )}

      <div className="sec"><h2>Safety</h2></div>
      <button className="btn danger" onClick={signEveryoneOut}><Icon name="logout" /><span>Sign everyone out</span></button>
      <p className="fine">Payments and games join this dashboard in the next steps.</p>
    </Shell>
  )
}
