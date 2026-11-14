import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatPhone, whatsappLink } from '../lib/phone'
import { minutesAgo, mmss } from '../lib/time'
import { useToast } from '../lib/toast'
import type { OtpRequest } from '../lib/types'
import { Icon } from './Icon'

/** A waiting sign-in code with one-tap Copy and Send on WhatsApp. */
export function CodeCard({ req, onChange }: { req: OtpRequest; onChange: () => void }) {
  const toast = useToast()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  const left = (new Date(req.expires_at).getTime() - now) / 1000
  const mins = Math.max(1, Math.ceil(left / 60))
  const message = `Your Pro11 sign-in code is ${req.code}. It works for ${mins} more minute${mins === 1 ? '' : 's'}.`
  const spaced = req.code.length === 6 ? `${req.code.slice(0, 3)} ${req.code.slice(3)}` : req.code

  const copy = async () => {
    try { await navigator.clipboard.writeText(req.code); toast('Code copied') } catch { toast('Couldn’t copy. Select the code instead.') }
  }
  const ignore = async () => {
    await supabase.rpc('admin_set_code_status', { p_id: req.id, p_status: 'ignored' })
    toast('Code cancelled'); onChange()
  }

  return (
    <div className="otp-card">
      <div className="req-head">
        <span className="av" style={{ ['--a' as string]: '#BFE3FF' }} aria-hidden="true">{req.name.charAt(0).toUpperCase()}</span>
        <span>
          <span className="rt">{req.name}</span>
          <span className="rs num">{formatPhone(req.phone)}</span>
        </span>
        <span className="rs" style={{ textAlign: 'right' }}>
          {left > 0 ? <>Expires in <span className="num">{mmss(left)}</span></> : 'Expired'}
          <br />{minutesAgo(req.created_at)}
        </span>
      </div>
      {!req.is_member && <p className="meta-line"><span className="tag warn"><span className="tx">New person</span></span></p>}
      <p className="otp-code" aria-label={`Code ${req.code.split('').join(' ')}`}>{spaced}</p>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={copy}><Icon name="copy" /><span>Copy</span></button>
        <a className="btn primary" href={whatsappLink(req.phone, message)} target="_blank" rel="noreferrer">
          <Icon name="send" /><span>Send on WhatsApp</span>
        </a>
      </div>
      <p style={{ textAlign: 'center', marginTop: 4 }}><button className="textlink" onClick={ignore} style={{ color: 'var(--bad)' }}>Cancel this code</button></p>
    </div>
  )
}
