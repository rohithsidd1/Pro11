export type IconName =
  | 'wallet' | 'bell' | 'back' | 'chev' | 'clock' | 'check' | 'plus' | 'x' | 'stumps' | 'trophy' | 'user' | 'copy'
  | 'upload' | 'send' | 'shield' | 'refresh' | 'edit' | 'down' | 'up' | 'alert' | 'receipt' | 'sliders' | 'gauge'
  | 'log' | 'logout' | 'phone' | 'info' | 'key' | 'image' | 'lock' | 'ban' | 'search' | 'eye'

export function Icon({ name, small, className, style }: { name: IconName; small?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={['i', small ? 's' : '', className ?? ''].filter(Boolean).join(' ')} aria-hidden="true" style={style}>
      <use href={`#i-${name}`} />
    </svg>
  )
}
