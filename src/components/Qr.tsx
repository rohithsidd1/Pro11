import { useEffect, useState } from 'react'

/** QR code for a UPI link, so a computer screen can be scanned with a phone. */
export function Qr({ value, size = 168, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string>('')
  useEffect(() => {
    let alive = true
    void import('qrcode').then((QR) => QR.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })).then((s) => { if (alive) setSvg(s) })
    return () => { alive = false }
  }, [value])
  return <span className="qr" role="img" aria-label={label} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
