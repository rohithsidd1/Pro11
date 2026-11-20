import { useEffect, useRef, useState } from 'react'
/** Loading placeholders with a shimmer, shaped like the content that is coming. */
export function Sk({ w = '100%', h = 14, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
}

export function SkRows({ n = 4, avatar = true }: { n?: number; avatar?: boolean }) {
  return (
    <div className="list sk-delay" role="status" aria-label="Loading">
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

/** Match cards while they load: the real card's own markup and styles, so nothing moves when the data arrives. */
export function SkCards({ n = 4 }: { n?: number }) {
  return (
    <ol className="stack grid sk-delay" role="status" aria-label="Loading matches">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="card sk-cardx" style={{ ['--c' as string]: 'var(--sk-card)' }}>
          <span className="tab l"><Sk w={64} h={11} /></span>
          <span className="tab r"><Sk w={40} h={11} /></span>
          <span className="grip" aria-hidden="true" />
          <div className="card-link">
            <div className="card-body">
              <div className="time"><Sk w={78} h={32} /><Sk w={38} h={18} r={9} style={{ marginTop: 6 }} /></div>
              <div className="teams">
                <div className="team"><span className="badge"><Sk w={46} h={46} r={23} /></span><span className="tn"><Sk w={58} h={13} /></span></div>
                <div className="vs"><span className="v"><Sk w={14} h={10} /></span></div>
                <div className="team"><span className="badge"><Sk w={46} h={46} r={23} /></span><span className="tn"><Sk w={58} h={13} /></span></div>
              </div>
              <div className="venue"><Sk w={92} h={17} /><Sk w={128} h={12} style={{ marginTop: 5 }} /></div>
            </div>
            <div className="meta"><Sk w={104} h={28} r={14} /><Sk w={86} h={28} r={14} /></div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function SkPanel({ lines = 4 }: { lines?: number }) {
  return (
    <section className="panel sk-delay" role="status" aria-label="Loading">
      <Sk w="40%" h={18} />
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>{Array.from({ length: lines }, (_, i) => <Sk key={i} w={`${92 - i * 9}%`} h={14} />)}</div>
    </section>
  )
}

/** A whole screen while it loads: a header block and a list. */
export function SkScreen({ hero = true, rows = 5 }: { hero?: boolean; rows?: number }) {
  return (
    <div className="sk-delay" style={{ display: 'grid', gap: 12, maxWidth: 760 }} role="status" aria-label="Loading">
      {hero && <div className="sk-card" style={{ minHeight: 150 }}><Sk w="35%" h={14} /><Sk w="55%" h={40} style={{ marginTop: 16 }} /><Sk w="45%" h={12} style={{ marginTop: 14 }} /></div>}
      <SkRows n={rows} />
    </div>
  )
}

/**
 * Swaps a skeleton for the real content with a crossfade: the skeleton fades out on top while the content fades
 * in underneath, so there's never a hard cut or an empty frame. If loading was so quick that the skeleton never
 * became visible (under ~0.3 s), the content simply eases in and the skeleton is never shown.
 * `children` can be a function, so content that needs the loaded data is only built once it exists.
 */
export function SkSwap({ loading, skeleton, children }: { loading: boolean; skeleton: React.ReactNode; children: React.ReactNode | (() => React.ReactNode) }) {
  const [leaving, setLeaving] = useState(false)
  const startedAt = useRef<number | null>(loading ? Date.now() : null)
  const wasLoading = useRef(loading)
  useEffect(() => {
    if (loading && !wasLoading.current) startedAt.current = Date.now()
    if (!loading && wasLoading.current) {
      const shownFor = startedAt.current ? Date.now() - startedAt.current : 0
      wasLoading.current = false
      if (shownFor > 300) { setLeaving(true); const t = window.setTimeout(() => setLeaving(false), 470); return () => window.clearTimeout(t) }
    }
    wasLoading.current = loading
  }, [loading])
  if (loading) return <>{skeleton}</>
  return (
    <div className="sk-swap">
      <div className="sk-swap-in">{typeof children === 'function' ? (children as () => React.ReactNode)() : children}</div>
      {leaving && <div className="sk-swap-out" aria-hidden="true">{skeleton}</div>}
    </div>
  )
}
