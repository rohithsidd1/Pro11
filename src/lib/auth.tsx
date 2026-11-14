import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppSettings, Profile } from './types'

const SIGNED_IN_AT = 'pro11.signedInAt'
const EPOCH = 'pro11.epoch'
export const SIGNED_OUT_REASON = 'pro11.signedOutReason'

type Status = 'loading' | 'signed-out' | 'signed-in'

interface AuthValue {
  status: Status
  connectionError: boolean
  session: Session | null
  profile: Profile | null
  settings: AppSettings | null
  isAdmin: boolean
  refresh: () => Promise<void>
  completeSignIn: (tokenHash: string, epoch: number) => Promise<void>
  signOut: (reason?: 'expired' | 'manual') => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [connectionError, setConnectionError] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async (reason: 'expired' | 'manual' = 'manual') => {
    if (reason === 'expired') sessionStorage.setItem(SIGNED_OUT_REASON, 'expired')
    else sessionStorage.removeItem(SIGNED_OUT_REASON)
    localStorage.removeItem(SIGNED_IN_AT)
    localStorage.removeItem(EPOCH)
    await supabase.auth.signOut()
    setProfile(null)
    setStatus('signed-out')
  }, [])

  const load = useCallback(async (s: Session) => {
    const [p, st] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
    ])
    // A network problem is not a reason to sign someone out: show a retry instead.
    if (p.error || st.error) { setConnectionError(true); return }
    setConnectionError(false)
    const prof = p.data as Profile | null
    const set = st.data as AppSettings | null
    if (!prof || prof.blocked || !set) return signOut('expired')

    const now = Date.now()
    const at = Number(localStorage.getItem(SIGNED_IN_AT) || 0)
    if (!at) localStorage.setItem(SIGNED_IN_AT, String(now))
    const storedEpoch = Number(localStorage.getItem(EPOCH) || set.session_epoch)
    if (!localStorage.getItem(EPOCH)) localStorage.setItem(EPOCH, String(set.session_epoch))
    const tooOld = at > 0 && now - at > set.session_days * 864e5
    if (tooOld || storedEpoch !== set.session_epoch) return signOut('expired')

    setProfile(prof)
    setSettings(set)
    setStatus('signed-in')
    void supabase.rpc('touch_last_seen')
  }, [signOut])

  useEffect(() => {
    if (session === undefined) return
    if (session === null) { setProfile(null); setStatus('signed-out'); return }
    void load(session)
  }, [session, load])

  const refresh = useCallback(async () => { if (session) await load(session) }, [session, load])

  const completeSignIn = useCallback(async (tokenHash: string, epoch: number) => {
    localStorage.setItem(SIGNED_IN_AT, String(Date.now()))
    localStorage.setItem(EPOCH, String(epoch))
    sessionStorage.removeItem(SIGNED_OUT_REASON)
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (error) throw new Error('Couldn’t start your session. Ask for a new code.')
  }, [])

  const value = useMemo<AuthValue>(() => ({
    status, connectionError, session: session ?? null, profile, settings,
    isAdmin: profile?.role === 'admin', refresh, completeSignIn, signOut,
  }), [status, connectionError, session, profile, settings, refresh, completeSignIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
