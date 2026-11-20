import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/** A search query kept for this screen while you move around the app (so Back brings it back). */
export function useQuery(key: string) {
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem(`pro11.q.${key}`) ?? '' } catch { return '' } })
  useEffect(() => { try { if (q) sessionStorage.setItem(`pro11.q.${key}`, q); else sessionStorage.removeItem(`pro11.q.${key}`) } catch { /* private mode */ } }, [key, q])
  return [q, setQ] as const
}

/** The search box used everywhere: clear with × or Esc; on a keyboard, "/" jumps to it. */
export function SearchBar({ value, onChange, placeholder, label, style }: {
  value: string; onChange: (v: string) => void; placeholder: string; label?: string; style?: React.CSSProperties
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) { e.preventDefault(); ref.current?.focus() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return (
    <div className="input search" role="search" style={style}>
      <svg className="i" aria-hidden="true"><use href="#i-search" /></svg>
      <input ref={ref} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        value={value} placeholder={placeholder} aria-label={label ?? placeholder} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { onChange(''); e.currentTarget.blur() } }} />
      {value && <button type="button" className="clear" aria-label="Clear search" onClick={() => { onChange(''); ref.current?.focus() }}><Icon name="x" small /></button>}
    </div>
  )
}
