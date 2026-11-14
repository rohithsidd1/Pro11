/** "98765 43210", "+91 98765 43210", "09876543210" → "+919876543210", else null. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, '')
  let ten = d
  if (d.length === 12 && d.startsWith('91')) ten = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) ten = d.slice(1)
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null
}

/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(e164: string): string {
  const d = e164.replace(/^\+91/, '')
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`
}

/** Typing helper: keeps digits and groups them 5 + 5. */
export function typePhone(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 10)
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d
}

export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace('+', '')}?text=${encodeURIComponent(text)}`
}
