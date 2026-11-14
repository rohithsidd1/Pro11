import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Qr } from '../../components/Qr'
import { Shell } from '../../components/Shell'
import { errorText } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { APP_LABEL, isoToLocalInput, localInputToIso, parseReceipt, rupees, shrinkImage, upiLink, type UpiApp } from '../../lib/money'
import { readScreenshotText } from '../../lib/ocr'
import { uploadProof } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import type { MoneySettings } from '../../lib/types'

const APPS: UpiApp[] = ['phonepe', 'gpay', 'paytm', 'other']

export function AddMoney() {
  const { profile, settings } = useAuth()
  const s = settings as unknown as MoneySettings
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [amountText, setAmountText] = useState(params.get('amount') ?? '200')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [text, setText] = useState<string | null>(null)
  const [utr, setUtr] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [app, setApp] = useState<UpiApp>('phonepe')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const amount = Math.floor(Number(amountText) || 0)
  const amountOk = amount >= s.min_topup && amount <= s.max_topup
  const chips = [50, 100, 200, 500].filter((v) => v >= s.min_topup && v <= s.max_topup)
  const first = s.payee_name.split(' ')[0]
  const link = upiLink({ upi: s.upi_id, name: s.payee_name, amount: amountOk ? amount : 0, note: `Pro11 wallet ${profile?.name.split(' ')[0] ?? ''}`.trim() })
  const accepted: Record<UpiApp, boolean> = { phonepe: s.accept_phonepe, gpay: s.accept_gpay, paytm: s.accept_paytm, other: s.accept_other_upi }

  const read = useMemo(() => (text === null ? null : parseReceipt(text, { amount, upiId: s.upi_id, payeeName: s.payee_name })), [text, amount, s.upi_id, s.payee_name])
  const utrDigits = utr.replace(/\D/g, '')
  const utrOk = utrDigits.length === 12
  const paidIso = localInputToIso(paidAt)
  const recent = paidIso ? Date.now() - new Date(paidIso).getTime() < 3 * 864e5 && new Date(paidIso).getTime() < Date.now() + 36e5 : false

  const choose = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Choose a screenshot (an image).')
    setError(null); setFile(f); setText(null); setProgress(0)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(f))
    setReading(true)
    try {
      const t = await readScreenshotText(f, setProgress)
      setText(t)
      const r = parseReceipt(t, { amount, upiId: s.upi_id, payeeName: s.payee_name })
      if (r.utr) setUtr(r.utr)
      if (r.paidAt) setPaidAt(isoToLocalInput(r.paidAt))
      if (r.app !== 'other') setApp(r.app)
    } catch {
      setText('')
      setError('Couldn’t read the screenshot. Fill in the details below yourself.')
    } finally {
      setReading(false)
    }
  }

  const submit = async () => {
    if (!file || !profile) return
    if (!amountOk) return setError(`Enter an amount from ${rupees(s.min_topup)} to ${rupees(s.max_topup)}.`)
    if (utrDigits && !utrOk) return setError('A UTR has exactly 12 digits. Check the screenshot, or leave it empty.')
    setBusy(true); setError(null)
    try {
      const blob = await shrinkImage(file)
      const path = `${profile.id}/${crypto.randomUUID()}.jpg`
      await uploadProof(path, blob)
      const { data, error: err } = await supabase.rpc('submit_topup', {
        p_amount: amount, p_utr: utrDigits || null, p_app: app, p_paid_at: paidIso, p_paid_to: read?.paidTo ?? null,
        p_path: path, p_ocr: read ? { ...read, text: (text ?? '').slice(0, 2000) } : {},
      })
      if (err) throw new Error(errorText(err))
      navigate(`/wallet/payment/${data as string}?sent=1`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send it. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(s.upi_id); toast('UPI ID copied') } catch { toast('Couldn’t copy') }
  }

  return (
    <Shell title="Add money" back="/wallet">
      <div className="steps three">
        <section className="panel">
          <div className="step">
            <span className="step-n">1</span><p className="step-t">Pay {first} on any UPI app</p>
            <div className="step-b">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="amt">Amount</label>
                <div className={`input big${amountOk ? '' : ' bad'}`}>
                  <span className="pre">₹</span>
                  <input id="amt" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                </div>
                {!amountOk && <p className="help">From {rupees(s.min_topup)} to {rupees(s.max_topup)}.</p>}
              </div>
              {chips.length > 0 && (
                <div className="chips-q" role="group" aria-label="Quick amounts">
                  {chips.map((v) => <button key={v} type="button" className="qchip" aria-pressed={amount === v} onClick={() => setAmountText(String(v))}>{rupees(v)}</button>)}
                </div>
              )}
              <div className="upi"><span className="v">{s.upi_id}</span><button type="button" className="ghost-btn" aria-label="Copy UPI ID" onClick={copy}><Icon name="copy" /></button></div>
              <div className="narrow-only">
                <a className={`btn dark block${amountOk ? '' : ' disabled'}`} href={amountOk ? link : undefined} aria-disabled={!amountOk}>
                  <Icon name="send" /><span>Open UPI app with <span className="num">{rupees(amount)}</span></span>
                </a>
              </div>
              <div className="wide-only">
                {amountOk && (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <Qr value={link} size={132} label={`QR code to pay ${rupees(amount)} to ${s.upi_id}`} />
                    <p className="help">On a computer? Scan this with your phone’s UPI app.</p>
                  </div>
                )}
              </div>
              <p className="help">If your app won’t open the link, pay <span className="num">{rupees(amount)}</span> to the UPI ID above yourself.</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="step">
            <span className="step-n">2</span><p className="step-t">Upload the screenshot</p>
            <div className="step-b">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void choose(e.target.files?.[0])} />
              {preview ? (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <img className="shot-thumb" src={preview} alt="Your payment screenshot" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="rt">{reading ? 'Reading the screenshot…' : 'Screenshot added'}</p>
                    {reading
                      ? <div className="progress" style={{ marginTop: 10 }} aria-label="Reading progress"><i style={{ width: `${progress}%` }} /></div>
                      : <p className="rs">{read?.app && read.app !== 'other' ? `${APP_LABEL[read.app]}, details filled in` : 'Check the details in step 3'}</p>}
                    <button type="button" className="textlink" onClick={() => fileRef.current?.click()} disabled={reading}>Choose another</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="drop" onClick={() => fileRef.current?.click()}><Icon name="upload" />Choose the payment screenshot</button>
              )}
              <p className="help">Take the screenshot on the “Payment successful” screen, with the amount and UTR visible.</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="step">
            <span className="step-n">3</span><p className="step-t">Check what we read</p>
            <div className="step-b">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="utr">UTR (12 digits)</label>
                <div className={`input${utrDigits && !utrOk ? ' bad' : ''}`}>
                  <input id="utr" className="num" inputMode="numeric" value={utr} placeholder="4123 4567 8901"
                    onChange={(e) => setUtr(e.target.value.replace(/[^\d ]/g, '').slice(0, 15))} />
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="paid">Paid on</label>
                <div className="input"><input id="paid" type="datetime-local" className="num" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
              </div>
              <div>
                <span className="label-s" style={{ marginTop: 0 }}>App</span>
                <div className="seg sm" role="group" aria-label="App used">
                  {APPS.map((a) => <button key={a} type="button" aria-pressed={app === a} onClick={() => setApp(a)}>{a === 'other' ? 'Other' : APP_LABEL[a]}</button>)}
                </div>
              </div>
              {file && !reading && (
                <div className="checks" aria-live="polite">
                  <Check ok={Boolean(read?.amountMatches)} text={read?.amountMatches ? `${rupees(amount)} found on the screenshot` : `Couldn’t find ${rupees(amount)} on the screenshot${read?.amount ? `. It seems to show ${rupees(read.amount)}` : ''}`} />
                  <Check ok={utrOk} text={utrOk ? `UTR ${utrDigits.replace(/(\d{4})(?=\d)/g, '$1 ')}` : 'Add the 12-digit UTR from the screenshot'} />
                  <Check ok={Boolean(read?.toMatches)} text={read?.toMatches ? `Paid to ${s.payee_name}` : `Couldn’t see ${first}’s name or UPI ID on it`} />
                  <Check ok={recent} text={recent ? 'Paid recently' : 'The payment date is missing or looks old'} />
                  {!accepted[app] && <Check ok={false} bad text={`${APP_LABEL[app]} payments aren’t accepted. Ask ${first}.`} />}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {error && <p className="form-error" role="alert"><Icon name="alert" small />{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 20 }}>
        <p className="help" style={{ maxWidth: '48ch' }}>{first} checks it, then your wallet updates. Anything we couldn’t confirm is fine to send: he decides.</p>
        <button className="btn primary" style={{ minWidth: 260 }} disabled={!file || reading || busy || !amountOk || !accepted[app]} onClick={submit}>
          {busy ? <span className="spinner" aria-label="Sending" /> : <span>Send <span className="num">{rupees(amount)}</span> for approval</span>}
        </button>
      </div>
    </Shell>
  )
}

function Check({ ok, text, bad }: { ok: boolean; text: string; bad?: boolean }) {
  return (
    <p className={`check ${ok ? 'ok' : bad ? 'bad' : 'warn'}`}>
      <span className="ci"><Icon name={ok ? 'check' : 'alert'} /></span><span>{text}</span>
    </p>
  )
}
