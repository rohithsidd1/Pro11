import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { SIGNED_OUT_REASON, useAuth } from '../lib/auth'
import { Splash } from './Splash'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const loc = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'signed-out') {
    const expired = sessionStorage.getItem(SIGNED_OUT_REASON) === 'expired'
    return <Navigate to={expired ? '/signed-out' : '/welcome'} replace state={{ from: loc.pathname }} />
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function SignedOutOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <Splash />
  if (status === 'signed-in') return <Navigate to="/" replace />
  return <>{children}</>
}
