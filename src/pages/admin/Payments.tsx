import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Empty } from '../../components/Empty'
import { Icon } from '../../components/Icon'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { istDate, istTime } from '../../lib/ist'
import { APP_LABEL, rupees } from '../../lib/money'
import { useSignedUrl } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MoneySettings, PaymentProof } from '../../lib/types'

type Row = PaymentProof & { who: { name: string; color: string | null } | null }
const SELECT = '*, who:profiles!payment_proofs_user_id_fkey(name, color)'
const REASONS = ['The amount doesn’t match the screenshot', 'This UTR or screenshot was already used', 'It wasn’t paid to me', 'The screenshot is unclear', 'I didn’t receive this money']
const when = (iso: string | null) => (iso ? `${istDate(iso)}, ${istTime(iso)}` : '—')

export function Payments() {
  const toast = useToast()
  const [pending, setPending] = useState<Row[]>([])
  const [recent, setRecent] = useState<Row[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('payment_proofs').select(SELECT).eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('payment_proofs').select(SELECT).neq('status', 'pending').order('created_at', { ascending: false }).limit(15),
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

  return (
    <Shell title="Payments" kicker={pending.length ? `${pending.length} to check` : 'All checked'}>
      <div className="review-layout">
        <div className="rl-queue">
          {pending.length === 0 && <Empty icon="check" title="Nothing to check">New payments show up here, oldest first.</Empty>}
          <div className="list">
            {pending.map((p) => <QueueRow key={p.id} p={p} active={p.id === selected} onClick={() => setSelected(p.id)} />)}
          </div>
        </div>
        <div className="rl-detail">{current ? <Review key={current.id} p={current} onDone={(msg) => { toast(msg); setSelected(null); void load() }} /> : null}</div>
        {recent.length > 0 && (
          <div className="rl-recent">
            <div className="sec"><h2>Recently checked</h2></div>
            <div className="list">
              {recent.map((p) => <QueueRow key={p.id} p={p} active={p.id === selected} onClick={() => setSelected(p.id)} />)}
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

function QueueRow({ p, active, onClick }: { p: Row; active: boolean; onClick: () => void }) {
  const tag = p.status === 'pending' ? null : p.status === 'approved' ? ['Approved', 'tag ok'] : p.status === 'rejected' ? ['Rejected', 'tag bad'] : ['Cancelled', 'tag']
  return (
    <button className="row queue-row" aria-current={active} onClick={onClick} style={{ border: '1.5px solid transparent' }}>
      <Avatar name={p.who?.name ?? '?'} color={p.who?.color ?? '#C7B6F7'} />
      <span style={{ minWidth: 0 }}>
        <span className="rt">{p.who?.name ?? 'Member'}</span>
        <span className="rs">{APP_LABEL[p.app]}, {when(p.created_at)}</span>
      </span>
      <span className="hist-right">
        <span className="amt">{rupees(p.amount)}</span>
        {tag && <span className={tag[1]}><span className="tx">{tag[0]}</span></span>}
      </span>
    </button>
  )
}

function Review({ p, onDone }: { p: Row; onDone: (msg: string) => void }) {
  const { settings } = useAuth()
  const s = settings as unknown as MoneySettings
  const url = useSignedUrl(p.screenshot_path)
  const [utrHistory, setUtrHistory] = useState<{ status: string; created_at: string }[]>([])
  const [mode, setMode] = useState<'view' | 'reject'>('view')
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [otherAmount, setOtherAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!p.utr) return
    void supabase.from('payment_proofs').select('status, created_at').eq('utr', p.utr).neq('id', p.id).then(({ data }) => setUtrHistory(data ?? []))
  }, [p.id, p.utr])

  const paidRecently = p.paid_at ? Math.abs(new Date(p.created_at).getTime() - new Date(p.paid_at).getTime()) < 3 * 864e5 : false
  const accepted = { phonepe: s.accept_phonepe, gpay: s.accept_gpay, paytm: s.accept_paytm, other: s.accept_other_upi }[p.app]
  const amountFinal = otherAmount ? Math.floor(Number(otherAmount)) : p.amount

  const approve = async () => {
    if (!amountFinal || amountFinal <= 0) return setError('Enter the amount you received.')
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('admin_review_topup', { p_id: p.id, p_approve: true, p_amount: amountFinal })
    setBusy(false)
    if (error) return setError(errorText(error))
    onDone(`${rupees(amountFinal)} added to ${p.who?.name ?? 'their'} wallet`)
  }
  const reject = async () => {
    setBusy(true); setError(null)
    const text = note.trim() ? `${reason}. ${note.trim()}` : reason
    const { error } = await supabase.rpc('admin_review_topup', { p_id: p.id, p_approve: false, p_reason: text })
    setBusy(false)
    if (error) return setError(errorText(error))
    onDone('Payment rejected. They’ve been told why.')
  }

  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={p.who?.name ?? '?'} color={p.who?.color ?? '#C7B6F7'} />
        <div style={{ flex: 1, minWidth: 0 }}><p className="rt">{p.who?.name}</p><p className="rs">Sent {when(p.created_at)}</p></div>
        <p className="amt-hero" style={{ fontSize: 34 }}>{rupees(p.amount)}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 150px) 1fr', gap: 16, marginTop: 16 }}>
        <a href={url ?? undefined} target="_blank" rel="noreferrer" aria-label="Open screenshot full size">
          {url ? <img className="shot-big" src={url} alt="Payment screenshot" /> : <span className="shot-thumb" style={{ display: 'block' }} />}
        </a>
        <div>
          <div className="read"><span className="k">App</span><span className="v" style={{ fontFamily: 'var(--text)' }}>{APP_LABEL[p.app]}</span></div>
          <div className="read"><span className="k">UTR</span><span className="v">{p.utr ?? 'Not given'}</span></div>
          <div className="read"><span className="k">Paid on</span><span className="v">{when(p.paid_at)}</span></div>
          {p.ocr?.paidTo && <div className="read"><span className="k">Paid to</span><span className="v" style={{ fontFamily: 'var(--text)' }}>{p.ocr.paidTo}</span></div>}
        </div>
      </div>

      <div className="checks" style={{ marginTop: 16 }}>
        <Check ok={Boolean(p.ocr?.amountMatches)} text={p.ocr?.amountMatches ? `${rupees(p.amount)} found on the screenshot` : `Couldn’t find ${rupees(p.amount)} on the screenshot${p.ocr?.amount ? `. It seems to show ${rupees(p.ocr.amount)}` : ''}`} />
        <Check ok={Boolean(p.utr) && utrHistory.length === 0} text={!p.utr ? 'No UTR given' : utrHistory.length ? `This UTR was in ${utrHistory.length} earlier ${utrHistory.length === 1 ? 'payment' : 'payments'} (${utrHistory.map((h) => h.status).join(', ')})` : 'UTR not used before'} />
        <Check ok={Boolean(p.ocr?.toMatches)} text={p.ocr?.toMatches ? `Paid to ${s.payee_name}` : 'Couldn’t confirm it was paid to you'} />
        <Check ok={paidRecently} text={paidRecently ? 'Paid around when it was sent' : 'Payment date is missing or far from when it was sent'} />
        {!accepted && <Check ok={false} text={`${APP_LABEL[p.app]} isn’t on your accepted list`} />}
      </div>
      <p className="help" style={{ marginTop: 12 }}>Also check your UPI app: did <span className="num">{rupees(p.amount)}</span> actually arrive?</p>
      {p.ocr?.text && (
        <details style={{ marginTop: 10 }}>
          <summary className="help" style={{ cursor: 'pointer' }}>Text read from the screenshot</summary>
          <pre className="help" style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontFamily: 'var(--num)', fontSize: 12 }}>{p.ocr.text}</pre>
        </details>
      )}

      {p.status !== 'pending' ? (
        <p className="help" style={{ marginTop: 16 }}>{p.status === 'approved' ? `Approved ${when(p.reviewed_at)}.` : p.status === 'rejected' ? `Rejected ${when(p.reviewed_at)}: ${p.reject_reason}` : 'Cancelled by the member.'}</p>
      ) : mode === 'view' ? (
        <>
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="other">Received a different amount? <span className="help">(optional)</span></label>
            <div className="input"><span className="pre">₹</span><input id="other" inputMode="numeric" className="num" value={otherAmount} placeholder={String(p.amount)} onChange={(e) => setOtherAmount(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
          </div>
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn danger" disabled={busy} onClick={() => setMode('reject')}><Icon name="x" /><span>Reject</span></button>
            <button className="btn primary" disabled={busy} onClick={approve}>{busy ? <span className="spinner" /> : <><Icon name="check" /><span>Approve <span className="num">{rupees(amountFinal || p.amount)}</span></span></>}</button>
          </div>
        </>
      ) : (
        <>
          <span className="label-s">Why? {p.who?.name.split(' ')[0]} will see this.</span>
          <div role="radiogroup" style={{ display: 'grid', gap: 6 }}>
            {REASONS.map((r) => (
              <button key={r} type="button" className="opt" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}>
                <span className="radio" /><span style={{ fontSize: 14, fontWeight: 600 }}>{r}</span>
              </button>
            ))}
          </div>
          <span className="label-s">Note <span className="help">(optional)</span></span>
          <textarea className="area" value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="For example: I received ₹150, upload the right screenshot." />
          {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} onClick={() => setMode('view')}><span>Back</span></button>
            <button className="btn danger" disabled={busy} onClick={reject}>{busy ? <span className="spinner" /> : <span>Reject payment</span>}</button>
          </div>
        </>
      )}
    </section>
  )
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <p className={`check ${ok ? 'ok' : 'warn'}`}><span className="ci"><Icon name={ok ? 'check' : 'alert'} /></span><span>{text}</span></p>
}
