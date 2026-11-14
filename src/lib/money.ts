// Money helpers: formatting, UPI links, reading payment screenshots, shrinking images before upload.

export type UpiApp = 'phonepe' | 'gpay' | 'paytm' | 'other'
export const APP_LABEL: Record<UpiApp, string> = { phonepe: 'PhonePe', gpay: 'GPay', paytm: 'Paytm', other: 'Other UPI app' }

/** 1240 → "₹1,240", -50 → "−₹50" */
export function rupees(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-IN')
  if (n < 0) return `−₹${abs}`
  return opts.sign && n > 0 ? `+₹${abs}` : `₹${abs}`
}

/** A UPI "pay" link. Phones open PhonePe / GPay / Paytm with the amount filled in. */
export function upiLink(p: { upi: string; name: string; amount: number; note: string }): string {
  const q = new URLSearchParams({ pa: p.upi, pn: p.name, am: `${Math.round(p.amount)}.00`, cu: 'INR', tn: p.note })
  return `upi://pay?${q.toString()}`
}

export const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/

// ---------------------------------------------------------------------------------------------
// Reading a payment screenshot (text from Tesseract). Best effort: the admin always has the
// final say, so this fills the form and flags what it couldn't confirm.
// ---------------------------------------------------------------------------------------------
export interface ReceiptRead {
  amount: number | null
  amountMatches: boolean
  utr: string | null
  paidAt: string | null        // ISO
  paidTo: string | null
  toMatches: boolean
  app: UpiApp
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function detectApp(t: string): UpiApp {
  if (/phone\s?pe/i.test(t)) return 'phonepe'
  if (/google\s?pay|\bg\s?pay\b/i.test(t)) return 'gpay'
  if (/paytm/i.test(t)) return 'paytm'
  return 'other'
}

function findUtr(t: string): string | null {
  const keyed = /(?:utr|upi\s*ref(?:erence)?(?:\s*(?:no|number|id))?|ref(?:erence)?\.?\s*(?:no|number)|upi\s*transaction\s*id|bank\s*reference(?:\s*no)?)[^0-9]{0,20}((?:\d[\s-]?){12})/i
  const m = t.match(keyed)
  if (m) {
    const d = m[1].replace(/\D/g, '')
    if (d.length === 12) return d
  }
  // Fallback: a lone 12-digit number that isn't a 91-prefixed phone number
  for (const x of t.matchAll(/(?<!\d)(\d{12})(?!\d)/g)) {
    if (!/^91[6-9]\d{9}$/.test(x[1])) return x[1]
  }
  return null
}

function findDate(t: string, now: Date): string | null {
  const lower = t.toLowerCase()
  let day: number | null = null, month: number | null = null, year: number | null = null
  let m = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,\s]*(\d{4})?/)
  if (m) { day = +m[1]; month = MONTHS.indexOf(m[2]); year = m[3] ? +m[3] : null }
  else if ((m = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})(?:st|nd|rd|th)?[,\s]*(\d{4})?/))) {
    month = MONTHS.indexOf(m[1]); day = +m[2]; year = m[3] ? +m[3] : null
  } else if ((m = lower.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/))) {
    day = +m[1]; month = +m[2] - 1; year = +m[3] < 100 ? 2000 + +m[3] : +m[3]
  }
  if (day === null || month === null || month < 0 || day < 1 || day > 31) return null
  const y = year ?? now.getFullYear()
  let hh = 12, mm = 0
  const tm = lower.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/)
  if (tm) {
    hh = +tm[1]; mm = +tm[2]
    if (tm[3] === 'pm' && hh < 12) hh += 12
    if (tm[3] === 'am' && hh === 12) hh = 0
    if (hh > 23 || mm > 59) { hh = 12; mm = 0 }
  }
  // The screenshot shows India time
  const utc = Date.UTC(y, month, day, hh, mm) - 5.5 * 3600e3
  return isNaN(utc) ? null : new Date(utc).toISOString()
}

export function parseReceipt(text: string, expected: { amount: number; upiId: string; payeeName: string }, now = new Date()): ReceiptRead {
  const t = text.replace(/\u00a0/g, ' ')
  const flat = t.toLowerCase().replace(/\s+/g, '')
  const exp = Math.round(expected.amount)
  const expGrouped = exp.toLocaleString('en-IN')
  // ₹ is often read as %, ?, z, F, & — or dropped. Never match inside a bigger number (₹1,200 isn’t ₹200).
  const amt = `(?:${exp}|${expGrouped.replace(/,/g, ',?')})(?:\\.00)?`
  const amountRe = new RegExp(`(?:₹|rs\\.?|inr|[%?zZF&¥=])?\\s*(?<![\\d,]|\\d\\.)${amt}(?![\\d,])`, 'i')
  // A line holding only the amount, where ₹ was misread as one stray digit or symbol ("3200" for "₹200")
  const loneAmount = new RegExp(`^[₹%?zZF&¥=23]?\\s*${amt}$`)
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const isTime = (l: string) => /\b\d{1,2}:\d{2}\b|\b\d{1,2}\.\d{2}\s*[ap]m\b/i.test(l)
  const amountMatches = lines.some((l) =>
    !isTime(l) && !/(?:utr|ref|transaction id)/i.test(l) && (loneAmount.test(l) || amountRe.test(l)))

  let amount: number | null = amountMatches ? exp : null
  if (amount === null) {
    const cand = t.match(/(?:₹|rs\.?|inr)\s*([\d,]+)(?:\.\d{2})?/i)
    if (cand) amount = parseInt(cand[1].replace(/,/g, ''), 10) || null
  }

  const name = expected.payeeName.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const upi = expected.upiId.toLowerCase()
  const toMatches = (upi && flat.includes(upi.replace(/\s+/g, ''))) || (name.length > 0 && name.every((w) => flat.includes(w))) || (name[0] ? flat.includes(name[0]) : false)
  const toLine = t.match(/(?:paid to|sent to|to)\s*[:-]?\s*([A-Za-z][A-Za-z .]{2,40})/i)

  return {
    amount, amountMatches,
    utr: findUtr(t),
    paidAt: findDate(t, now),
    paidTo: toLine ? toLine[1].trim() : null,
    toMatches: Boolean(toMatches),
    app: detectApp(t),
  }
}

/** Shrinks a screenshot to at most `maxSide` pixels and re-encodes it as JPEG (keeps uploads around 150 KB). */
export async function shrinkImage(file: File, maxSide = 1400, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t read the image'))), 'image/jpeg', quality))
}

/** IST date-time for <input type="datetime-local"> ↔ ISO */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600e3)
  return d.toISOString().slice(0, 16)
}
export function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(`${v}:00Z`)
  return isNaN(d.getTime()) ? null : new Date(d.getTime() - 5.5 * 3600e3).toISOString()
}
