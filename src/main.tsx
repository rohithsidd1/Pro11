import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { configError } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import './styles/app.css'

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
