export function Avatar({ name, color, size }: { name: string; color: string; size?: 'xl' }) {
  const letter = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className={size === 'xl' ? 'av xl' : 'av'} style={{ ['--a' as string]: color }} aria-hidden="true">
      {letter}
    </span>
  )
}
