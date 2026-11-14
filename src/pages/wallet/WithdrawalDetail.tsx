import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { istDate, istTime } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { useSignedUrl } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { Withdrawal } from '../../lib/types'

const when = (iso: string | null) => (iso ? `${istDate(iso)}, ${istTime(iso)}` : '—')

export function WithdrawalDetail() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { settings } = useAuth()
  const toast = useToast()
  const [w, setW] = useState<Withdrawal | null>(null)
  const [loading, setLoading] = useState(true)
  const proofUrl = useSignedUrl(w?.proof_path)
  const first = (settings?.admin_name ?? 'The admin').split(' ')[0]

  const load = useCallback(async () => {
    const { data } = await supabase.from('withdrawals').select('*').eq('id', id).maybeSingle()
    setW(data as Withdrawal | null); setLoading(false)
  }, [id])
  useEffect(() => { void load() }, [load])

  const cancel = async () => {
    if (!window.confirm('Cancel this withdrawal? The money goes back to your wallet.')) return
    const { error } = await supabase.rpc('cancel_withdrawal', { p_id: id })
    if (error) return toast(errorText(error))
    toast('Cancelled. The money is back in your wallet.'); void load()
  }

  if (loading) return <Shell title="Withdrawal" back="/wallet"><p className="help">Loading…</p></Shell>
  if (!w) return <Shell title="Withdrawal" back="/wallet"><Empty icon="up" title="Withdrawal not found" /></Shell>

  const tag = { pending: ['On its way', 'tag warn', 'clock'], paid: ['Paid', 'tag ok', 'check'], rejected: ['Rejected', 'tag bad', 'x'], cancelled: ['Cancelled', 'tag', 'ban'] }[w.status] as [string, string, 'clock' | 'check' | 'x' | 'ban']
  const justSent = params.get('sent') === '1' && w.status === 'pending'

  return (
    <Shell title="Withdrawal" back="/wallet">
      <div className="split-2">
        <div style={{ display: 'grid', gap: 8 }}>
          {justSent ? (
            <div className="panel status-hero">
              <span className="status-ic" style={{ ['--b' as string]: 'var(--ok-bg)', color: 'var(--ok)', borderColor: 'var(--ok)' }}><Icon name="check" /></span>
              <h2 className="h1" style={{ fontSize: 30 }}>Withdrawal requested</h2>
              <p className="lead" style={{ maxWidth: '34ch' }}>{first} will send <span className="num">{rupees(w.amount)}</span> to {w.upi_id}. You’ll get a notification when it’s paid.</p>
            </div>
          ) : (
            <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <p className="amt-hero">{rupees(w.amount)}</p>
              <span className={tag[1]}><Icon name={tag[2]} /><span className="tx">{tag[0]}</span></span>
            </div>
          )}
          {w.status === 'rejected' && w.reject_reason && (
            <div className="panel" style={{ background: 'var(--bad-bg)' }}>
              <p className="rs" style={{ marginTop: 0 }}>{first}’s reason</p>
              <p className="rt" style={{ marginTop: 4 }}>{w.reject_reason}</p>
              <p className="help" style={{ marginTop: 8 }}>The money is back in your wallet.</p>
            </div>
          )}
          <div className="panel" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="read"><span className="k">To</span><span className="v">{w.upi_id}</span></div>
            <div className="read"><span className="k">Requested</span><span className="v">{when(w.created_at)}</span></div>
            {w.status === 'paid' && <div className="read"><span className="k">Paid</span><span className="v">{when(w.handled_at)}</span></div>}
            {w.utr && <div className="read"><span className="k">UTR</span><span className="v">{w.utr}</span></div>}
          </div>
          {w.status === 'pending' && <button className="btn danger" onClick={cancel}><Icon name="x" /><span>Cancel withdrawal</span></button>}
          {justSent && <Link className="btn primary block" to="/wallet"><span>Back to wallet</span></Link>}
        </div>
        {proofUrl && (
          <section className="panel">
            <div className="ch"><h3>Payment proof</h3><a className="textlink" href={proofUrl} target="_blank" rel="noreferrer" style={{ minHeight: 0 }}>Open full size</a></div>
            <img className="shot-big" src={proofUrl} alt="Proof of payment" />
          </section>
        )}
      </div>
    </Shell>
  )
}
