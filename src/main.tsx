import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { configError } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import './styles/app.css'
import { registerSW } from 'virtual:pwa-register'

// The app is installed like a phone app, so a tab left open could keep an old version.
// Check for a new version every 30 minutes and whenever the app comes back to the front; update straight away.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { void updateSW(true) },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => { if (navigator.onLine) void reg.update() }
    window.setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
  },
})

// Belt and braces: if the live site is a newer build than this copy, drop every saved copy and reload once.
async function freshness() {
  if (!navigator.onLine) return
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const { build } = (await r.json()) as { build?: string }
    if (!build || build === __BUILD_TIME__ || new Date(build) < new Date(__BUILD_TIME__)) return
    if (sessionStorage.getItem('pro11.reloadedFor') === build) return   // never loop
    sessionStorage.setItem('pro11.reloadedFor', build)
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((g) => g.update().catch(() => undefined)))
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
    window.location.reload()
  } catch { /* offline or blocked: try again later */ }
}
void freshness()
window.setInterval(() => void freshness(), 5 * 60 * 1000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void freshness() })

const root = createRoot(document.getElementById('root')!)

if (configError) {
  root.render(<div className="empty" style={{ minHeight: '100vh', justifyContent: 'center' }}><h2>Setup needed</h2><p>{configError}</p></div>)
} else {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}
