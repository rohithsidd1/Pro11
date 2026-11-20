/** Money as people read it: ₹1,250 · −₹50 · +₹16.67 (paise only when there are some). */
export function rupees(n: number, opts: { sign?: boolean } = {}): string {
  const v = Math.round(Math.abs(Number(n) || 0) * 100) / 100
  // ₹50 stays ₹50; ₹16.67 keeps its paise (ledger amounts can be exact shares)
  const abs = Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n < 0) return `−₹${abs}`
  return opts.sign && n > 0 ? `+₹${abs}` : `₹${abs}`
}
