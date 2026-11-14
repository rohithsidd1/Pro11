// Everything in the app is shown in India time.
const IST = 'Asia/Kolkata'
const OFFSET = 5.5 * 3600e3

/** Midnight IST, `days` from today, as a Date. */
export function istDayStart(days = 0): Date {
  const ist = new Date(Date.now() + OFFSET)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days) - OFFSET)
}

export const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST })

export const istDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST })

export function istDayName(iso: string): string {
  const t = new Date(iso).getTime()
  if (t >= istDayStart(0).getTime() && t < istDayStart(1).getTime()) return 'Today'
  if (t >= istDayStart(1).getTime() && t < istDayStart(2).getTime()) return 'Tomorrow'
  if (t >= istDayStart(-1).getTime() && t < istDayStart(0).getTime()) return 'Yesterday'
  return istDate(iso)
}

/** "2h 10m", "45m", "3d 2h" */
export function untilText(iso: string): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 48) return `${h}h ${mins % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
