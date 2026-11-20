import { CodeCard } from '../../components/CodeCard'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { formatPhone } from '../../lib/phone'
import { supabase } from '../../lib/supabase'
import { clock } from '../../lib/time'
import type { CodeStatus } from '../../lib/types'
import { useCodes } from '../../lib/useCodes'
import { SkRows } from '../../components/Skeleton'

const STATUS: Record<CodeStatus, { label: string; cls: string }> = {
  pending: { label: 'Expired', cls: 'tag' },
  used: { label: 'Used', cls: 'tag ok' },
  expired: { label: 'Expired', cls: 'tag' },
  ignored: { label: 'Cancelled', cls: 'tag' },
  blocked: { label: 'Not a member', cls: 'tag warn' },
}

export function SignInCodes() {
  const { waiting, notMembers, earlier, loading, reload } = useCodes()
  return (
    <Shell title="Sign-in codes" back="/admin" kicker={`${waiting.length} waiting`}>
      <div className="cols-2">
        <div>
          {loading && <SkRows n={3} />}
          {waiting.length === 0 && !loading && (
            <Empty icon="key" title="No codes waiting">When someone asks to sign in, their code shows up here.</Empty>
          )}
          <div className="list">{waiting.map((r) => <CodeCard key={r.id} req={r} onChange={reload} />)}</div>

          {notMembers.length > 0 && (
            <>
              <div className="sec"><h2>Not on the members list</h2></div>
              <div className="list">
                {notMembers.map((r) => (
                  <div key={r.id} className="row">
                    <span className="ic" style={{ ['--b' as string]: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="alert" /></span>
                    <span><span className="rt">{r.name}</span><span className="rs num">{formatPhone(r.phone)}, {clock(r.created_at)}</span></span>
                    <button className="btn sm" onClick={async () => { await supabase.rpc('admin_set_code_status', { p_id: r.id, p_status: 'ignored' }); void reload() }}>
                      <span>Ignore</span>
                    </button>
                  </div>
                ))}
              </div>
              <p className="fine">Turn off “Only members can ask for codes” in settings to let new people in.</p>
            </>
          )}
        </div>

        <div>
          <div className="sec" style={{ paddingTop: 0 }}><h2>Last 24 hours</h2><span className="aside num">{earlier.length}</span></div>
          <div className="list">
            {earlier.length === 0 && <p className="help">Nothing yet.</p>}
            {earlier.map((r) => {
              const st = STATUS[r.status]
              return (
                <div key={r.id} className="row nolead">
                  <span><span className="rt">{r.name}</span><span className="rs"><span className="num">{formatPhone(r.phone)}</span>, asked at <span className="num">{clock(r.created_at)}</span></span></span>
                  <span className={st.cls}><span className="tx">{st.label}</span></span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Shell>
  )
}
