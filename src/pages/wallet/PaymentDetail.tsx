import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { istDate, istTime } from '../../lib/ist'
import { APP_LABEL, rupees } from '../../lib/money'
import { whatsappLink } from '../../lib/phone'
import { useSignedUrl } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MoneySettings, PaymentProof } from '../../lib/types'

const when = (iso: string | null) => (iso ? `${istDate(iso)}, ${istTime(iso)}` : '—')

export function PaymentDetail() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { settings } = useAuth()
  const s = settings as unknown as MoneySettings
  const toast = useToast()
  const [p, setP] = useState<PaymentProof | null>(null)
  const [loading, setLoading] = useState(true)
  const url = useSignedUrl(p?.screenshot_path)

  const load = useCallback(async () => {
    const { data } = await supabase.from('payment_proofs').select('*').eq('id', id).maybeSingle()
    setP(data as PaymentProof | null); setLoading(false)
  }, [id])
  useEffect(() => { void load() }, [load])

  const cancel = async () => {
    if (!window.confirm('Cancel this payment? It won’t be checked.')) return
    const { error } = await supabase.rpc('cancel_topup', { p_id: id })
    if (error) return toast(errorText(error))
    toast('Payment cancelled'); void load()
  }

  if (loading) return <Shell title="Payment" back="/wallet"><p className="help">Loading…</p></Shell>
  if (!p) return <Shell title="Payment" back="/wallet"><Empty icon="receipt" title="Payment not found" /></Shell>

  const tag = { pending: ['Checking', 'tag warn', 'clock'], approved: ['Approved', 'tag ok', 'check'], rejected: ['Rejected', 'tag bad', 'x'], cancelled: ['Cancelled', 'tag', 'ban'] }[p.status] as [string, string, 'clock' | 'check' | 'x' | 'ban']
  const first = s.admin_name.split(' ')[0]
  const justSent = params.get('sent') === '1' && p.status === 'pending'

  return (
    <Shell title="Payment" back="/wallet">
      <div className="split-2">
        <div className="vs16" style={{ display: 'grid', gap: 8 }}>
          {justSent ? (
            <div className="panel status-hero">
              <span className="status-ic" style={{ ['--b' as string]: 'var(--ok-bg)', color: 'var(--ok)', borderColor: 'var(--ok)' }}><Icon name="check" /></span>
              <h2 className="h1" style={{ fontSize: 30 }}>Sent for approval</h2>
              <p className="lead" style={{ maxWidth: '34ch' }}>{first} will check your <span className="num">{rupees(p.amount)}</span> payment. You’ll get a notification when it’s done.</p>
            </div>
          ) : (
            <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <p className="amt-hero" style={{ color: p.status === 'approved' ? 'var(--ok)' : undefined }}>{p.status === 'approved' ? '+' : ''}{rupees(p.amount)}</p>
              <span className={tag[1]}><Icon name={tag[2]} /><span className="tx">{tag[0]}</span></span>
            </div>
          )}
          {p.status === 'rejected' && p.reject_reason && (
            <div className="panel" style={{ background: 'var(--bad-bg)' }}>
              <p className="rs" style={{ marginTop: 0 }}>{first}’s reason</p>
              <p className="rt" style={{ marginTop: 4 }}>{p.reject_reason}</p>
            </div>
          )}
          <div className="panel" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="read"><span className="k">Amount</span><span className="v">{rupees(p.amount)}</span></div>
            <div className="read"><span className="k">App</span><span className="v" style={{ fontFamily: 'var(--text)' }}>{APP_LABEL[p.app]}</span></div>
            <div className="read"><span className="k">UTR</span><span className="v">{p.utr ? p.utr.replace(/(\d{4})(?=\d)/g, '$1 ') : 'Not given'}</span></div>
            <div className="read"><span className="k">Paid on</span><span className="v">{when(p.paid_at)}</span></div>
            <div className="read"><span className="k">Sent</span><span className="v">{when(p.created_at)}</span></div>
            {p.reviewed_at && <div className="read"><span className="k">{p.status === 'approved' ? 'Approved' : 'Checked'}</span><span className="v">{when(p.reviewed_at)}</span></div>}
          </div>
          {p.status === 'pending' && <button className="btn danger" onClick={cancel}><Icon name="x" /><span>Cancel this payment</span></button>}
          {p.status === 'rejected' && (
            <div className="btn-row">
              <a className="btn" href={whatsappLink(s.admin_phone, `Hi ${first}, about my ₹${p.amount} Pro11 payment`)} target="_blank" rel="noreferrer"><Icon name="send" /><span>Message {first}</span></a>
              <Link className="btn primary" to={`/wallet/add?amount=${p.amount}`}><Icon name="upload" /><span>Upload again</span></Link>
            </div>
          )}
          {justSent && <Link className="btn primary block" to="/wallet"><span>Back to wallet</span></Link>}
        </div>
        <section className="panel">
          <div className="ch"><h3>Your screenshot</h3>{url && <a className="textlink" href={url} target="_blank" rel="noreferrer" style={{ minHeight: 0 }}>Open full size</a>}</div>
          {url ? <img className="shot-big" src={url} alt="Payment screenshot" /> : <p className="help">Loading…</p>}
        </section>
      </div>
    </Shell>
  )
}
