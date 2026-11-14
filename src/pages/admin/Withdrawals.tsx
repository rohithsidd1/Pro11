import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Qr } from '../../components/Qr'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { istDate, istTime } from '../../lib/ist'
import { rupees, shrinkImage, upiLink } from '../../lib/money'
import { uploadProof, useSignedUrl } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { Withdrawal } from '../../lib/types'

type Row = Withdrawal & { who: { name: string; color: string | null } | null }
const SELECT = '*, who:profiles!withdrawals_user_id_fkey(name, color)'
const when = (iso: string | null) => (iso ? `${istDate(iso)}, ${istTime(iso)}` : '—')

export function Withdrawals() {
  const toast = useToast()
  const [pending, setPending] = useState<Row[]>([])
  const [recent, setRecent] = useState<Row[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('withdrawals').select(SELECT).eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('withdrawals').select(SELECT).neq('status', 'pending').order('created_at', { ascending: false }).limit(15),
    ])
    const list = (p.data as Row[] | null) ?? []
    setPending(list); setRecent((r.data as Row[] | null) ?? [])
    setSelected((cur) => (cur && [...list, ...((r.data as Row[] | null) ?? [])].some((x) => x.id === cur) ? cur : list[0]?.id ?? null))
  }, [])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15000)
    return () => window.clearInterval(t)
  }, [load])

  const current = [...pending, ...recent].find((x) => x.id === selected) ?? null
  const total = pending.reduce((s, w) => s + w.amount, 0)

  return (
    <Shell title="Withdrawals" kicker={pending.length ? `${pending.length} to pay, ${rupees(total)}` : 'All paid'}>
      <div className="review-layout">
        <div className="rl-queue">
          {pending.length === 0 && <Empty icon="check" title="Nothing to pay">Withdrawal requests show up here, oldest first.</Empty>}
          <div className="list">{pending.map((w) => <QueueRow key={w.id} w={w} active={w.id === selected} onClick={() => setSelected(w.id)} />)}</div>
        </div>
        <div className="rl-detail">{current ? <Payout key={current.id} w={current} onDone={(m) => { toast(m); setSelected(null); void load() }} /> : null}</div>
        {recent.length > 0 && (
          <div className="rl-recent">
            <div className="sec"><h2>Recently handled</h2></div>
            <div className="list">{recent.map((w) => <QueueRow key={w.id} w={w} active={w.id === selected} onClick={() => setSelected(w.id)} />)}</div>
          </div>
        )}
      </div>
    </Shell>
  )
}

function QueueRow({ w, active, onClick }: { w: Row; active: boolean; onClick: () => void }) {
  const tag = w.status === 'pending' ? null : w.status === 'paid' ? ['Paid', 'tag ok'] : w.status === 'rejected' ? ['Rejected', 'tag bad'] : ['Cancelled', 'tag']
  return (
    <button className="row queue-row" aria-current={active} onClick={onClick} style={{ border: '1.5px solid transparent' }}>
      <Avatar name={w.who?.name ?? '?'} color={w.who?.color ?? '#C7B6F7'} />
      <span style={{ minWidth: 0 }}><span className="rt">{w.who?.name ?? 'Member'}</span><span className="rs">{w.upi_id}, {when(w.created_at)}</span></span>
      <span className="hist-right"><span className="amt">{rupees(w.amount)}</span>{tag && <span className={tag[1]}><span className="tx">{tag[0]}</span></span>}</span>
    </button>
  )
}

function Payout({ w, onDone }: { w: Row; onDone: (m: string) => void }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [utr, setUtr] = useState('')
  const [proofPath, setProofPath] = useState<string | null>(w.proof_path)
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState<'pay' | 'reject'>('pay')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const proofUrl = useSignedUrl(proofPath)
  const first = w.who?.name.split(' ')[0] ?? 'them'
  const link = upiLink({ upi: w.upi_id, name: w.who?.name ?? 'Pro11 member', amount: w.amount, note: 'Pro11 withdrawal' })
  const utrDigits = utr.replace(/\D/g, '')
  const canPay = Boolean(proofPath) || utrDigits.length === 12

  const upload = async (f: File | undefined) => {
    if (!f) return
    setUploading(true); setError(null)
    try {
      const path = `withdrawals/${w.user_id}/${w.id}-${Date.now()}.jpg`
      await uploadProof(path, await shrinkImage(f))
      setProofPath(path)
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') } finally { setUploading(false) }
  }
  const pay = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('admin_pay_withdrawal', { p_id: w.id, p_utr: utrDigits || null, p_proof_path: proofPath })
    setBusy(false)
    if (error) return setError(errorText(error))
    onDone(`Marked ${rupees(w.amount)} as paid. ${first} has been told.`)
  }
  const reject = async () => {
    if (!reason.trim()) return setError(`Tell ${first} why.`)
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('admin_reject_withdrawal', { p_id: w.id, p_reason: reason.trim() })
    setBusy(false)
    if (error) return setError(errorText(error))
    onDone(`Rejected. ${rupees(w.amount)} is back in ${first}’s wallet.`)
  }
  const copy = async () => { try { await navigator.clipboard.writeText(w.upi_id); toast('UPI ID copied') } catch { toast('Couldn’t copy') } }

  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={w.who?.name ?? '?'} color={w.who?.color ?? '#C7B6F7'} />
        <div style={{ flex: 1, minWidth: 0 }}><p className="rt">{w.who?.name}</p><p className="rs">Asked {when(w.created_at)}</p></div>
        <p className="amt-hero" style={{ fontSize: 34 }}>{rupees(w.amount)}</p>
      </div>

      {w.status !== 'pending' ? (
        <>
          <div className="read" style={{ marginTop: 12 }}><span className="k">To</span><span className="v">{w.upi_id}</span></div>
          <p className="help" style={{ marginTop: 12 }}>{w.status === 'paid' ? `Paid ${when(w.handled_at)}${w.utr ? `, UTR ${w.utr}` : ''}.` : w.status === 'rejected' ? `Rejected: ${w.reject_reason}` : 'Cancelled by the member.'}</p>
          {proofUrl && <img className="shot-big" style={{ marginTop: 12, maxWidth: 200 }} src={proofUrl} alt="Payment proof" />}
        </>
      ) : mode === 'pay' ? (
        <div className="steps" style={{ marginTop: 16 }}>
          <div className="step">
            <span className="step-n">1</span><p className="step-t">Pay {first} <span className="num">{rupees(w.amount)}</span></p>
            <div className="step-b">
              <div className="upi"><span className="v">{w.upi_id}</span><button className="ghost-btn" aria-label="Copy UPI ID" onClick={copy}><Icon name="copy" /></button></div>
              <a className="btn dark block narrow-only" href={link}><Icon name="send" /><span>Open UPI app with <span className="num">{rupees(w.amount)}</span></span></a>
              <div className="wide-only">
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <Qr value={link} size={124} label={`QR code to pay ${rupees(w.amount)} to ${w.upi_id}`} />
                  <p className="help">Scan with your phone’s UPI app.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="step">
            <span className="step-n">2</span><p className="step-t">Add the UTR or a screenshot</p>
            <div className="step-b">
              <div className="input"><input className="num" inputMode="numeric" value={utr} placeholder="12-digit UTR" aria-label="UTR"
                onChange={(e) => setUtr(e.target.value.replace(/[^\d ]/g, '').slice(0, 15))} /></div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
              {proofPath
                ? <p className="check ok"><span className="ci"><Icon name="check" /></span><span>Screenshot added</span></p>
                : <button className="drop" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <span className="spinner" /> : <><Icon name="upload" />Upload payment screenshot</>}</button>}
            </div>
          </div>
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <div className="btn-row">
            <button className="btn danger" disabled={busy} onClick={() => setMode('reject')}><span>Reject</span></button>
            <button className="btn primary" disabled={busy || !canPay} onClick={pay}>{busy ? <span className="spinner" /> : <span>Mark as paid</span>}</button>
          </div>
          {!canPay && <p className="help">Add the UTR or a screenshot first, so there’s proof.</p>}
        </div>
      ) : (
        <>
          <span className="label-s">Why? {first} will see this, and gets the money back in the wallet.</span>
          <textarea className="area" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="For example: this UPI ID didn’t work, check it and ask again." />
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} onClick={() => setMode('pay')}><span>Back</span></button>
            <button className="btn danger" disabled={busy} onClick={reject}>{busy ? <span className="spinner" /> : <span>Reject and refund</span>}</button>
          </div>
        </>
      )}
    </section>
  )
}
