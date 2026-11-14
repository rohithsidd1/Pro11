import { useRef } from 'react'

/** One box per digit. Typing moves forward, Backspace moves back, pasting fills every box. */
export function OtpInput({ length, value, onChange, disabled }: {
  length: number; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const setAt = (i: number, d: string) => {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\D/g, '').slice(0, length)
    onChange(next)
  }

  return (
    <div className="otp" role="group" aria-label={`${length}-digit code`} style={{ ['--n' as string]: length }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          className={d ? 'filled' : undefined}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoFocus={i === 0}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '')
            if (!typed) return
            if (typed.length > 1) {
              const filled = (value.slice(0, i) + typed).slice(0, length)
              onChange(filled)
              refs.current[Math.min(filled.length, length - 1)]?.focus()
              return
            }
            setAt(i, typed)
            refs.current[Math.min(i + 1, length - 1)]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              if (d) setAt(i, '')
              else if (i > 0) { setAt(i - 1, ''); refs.current[i - 1]?.focus() }
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}
