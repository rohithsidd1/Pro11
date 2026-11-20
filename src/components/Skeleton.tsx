/** Loading placeholders with a shimmer, shaped like the content that is coming. */
export function Sk({ w = '100%', h = 14, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
}

export function SkRows({ n = 4, avatar = true }: { n?: number; avatar?: boolean }) {
  return (
    <div className="list" role="status" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row sk-row" style={{ gridTemplateColumns: avatar ? '44px 1fr auto' : '1fr auto' }}>
          {avatar && <Sk w={40} h={40} r={20} />}
          <span style={{ display: 'grid', gap: 8 }}><Sk w={`${55 + ((i * 17) % 30)}%`} h={14} /><Sk w={`${30 + ((i * 11) % 25)}%`} h={11} /></span>
          <Sk w={56} h={18} r={9} />
        </div>
      ))}
    </div>
  )
}

export function SkCards({ n = 4 }: { n?: number }) {
  return (
    <div className="stack grid" role="status" aria-label="Loading matches">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><Sk w={90} h={12} /><Sk w={46} h={12} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginTop: 18 }}>
            <Sk w={64} h={30} /><span style={{ display: 'flex', gap: 10 }}><Sk w={44} h={44} r={22} /><Sk w={44} h={44} r={22} /></span><Sk w="70%" h={14} style={{ justifySelf: 'end' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}><Sk w={100} h={26} r={13} /><Sk w={86} h={26} r={13} /></div>
        </div>
      ))}
    </div>
  )
}

export function SkPanel({ lines = 4 }: { lines?: number }) {
  return (
    <section className="panel" role="status" aria-label="Loading">
      <Sk w="40%" h={18} />
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>{Array.from({ length: lines }, (_, i) => <Sk key={i} w={`${92 - i * 9}%`} h={14} />)}</div>
    </section>
  )
}

/** A whole screen while it loads: a header block and a list. */
export function SkScreen({ hero = true, rows = 5 }: { hero?: boolean; rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 760 }} role="status" aria-label="Loading">
      {hero && <div className="sk-card" style={{ minHeight: 150 }}><Sk w="35%" h={14} /><Sk w="55%" h={40} style={{ marginTop: 16 }} /><Sk w="45%" h={12} style={{ marginTop: 14 }} /></div>}
      <SkRows n={rows} />
    </div>
  )
}
