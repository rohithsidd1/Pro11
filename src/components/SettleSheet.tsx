import { useState } from 'react'
import { errorText } from '../lib/api'
import { money, type Balance } from '../lib/useLedger'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

/** "I paid": the payer records a payment made outside the app; the receiver confirms it. */
export function SettleSheet({ person, onClose, onDone }: { person: Balance; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const owed = Math.max(0, -person.net - person.waiting_out)
  const [amount, setAmount] = useState(owed ? String(Math.round(owed * 100) / 100) : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const value = Number(amount)
  const upi = person.upi_id ? `upi://pay?pa=${encodeURIComponent(person.upi_id)}&pn=${encodeURIComponent(person.name)}&am=${value > 0 ? value.toFixed(2) : ''}&cu=INR&tn=${encodeURIComponent('Pro11')}` : null
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('record_payment', { p_to: person.user_id, p_amount: value, p_note: note || null })
    setBusy(false)
    if (error) return toast(errorText(error))
    toast(`Recorded. ${person.name.split(' ')[0]} will confirm it.`)
    onDone()
  }
  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label={`Settle up with ${person.name}`} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={person.name} color={person.color} />
          <span style={{ flex: 1 }}><span className="rt">Pay {person.name}</span><span className="rs">{owed ? `You owe ${money(owed)}` : 'You don’t owe them anything right now'}</span></span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="amt">Amount you paid</label>
          <div className="input"><span className="pre">₹</span><input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" /></div>
        </div>
        <div className="field"><label htmlFor="nt">Note <span className="help">(optional)</span></label><div className="input"><input id="nt" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Paid by UPI" /></div></div>
        {upi && <a className="btn block" href={upi} style={{ marginBottom: 8 }}><Icon name="send" small /><span>Open a UPI app to pay {person.upi_id}</span></a>}
        <p className="help" style={{ marginBottom: 12 }}>Pay them however you like (UPI, cash), then record it here. It counts once {person.name.split(' ')[0]} confirms.</p>
        <button className="btn primary block" disabled={busy || !(value > 0)} onClick={save}>{busy ? <span className="spinner" /> : <span>I paid {value > 0 ? money(value) : ''}</span>}</button>
      </div>
    </div>
  )
}
