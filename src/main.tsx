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
