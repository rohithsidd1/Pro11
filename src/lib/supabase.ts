import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configError =
  !url || !key ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.' : null

/**
 * Every request goes through here, so the app can tell when the server can't be reached (network down, server
 * error) and say so on every screen, instead of leaving loaders spinning. 'pro11:net' events carry ok: true/false.
 */
const watchedFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init)
    window.dispatchEvent(new CustomEvent('pro11:net', { detail: { ok: res.status < 500 } }))
    return res
  } catch (e) {
    // a request the app cancelled itself is not a connection problem; anything else is (Safari reports
    // a lost connection as "Load failed" or as an abort)
    if (!init?.signal?.aborted) window.dispatchEvent(new CustomEvent('pro11:net', { detail: { ok: false } }))
    throw e
  }
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'pro11-auth' },
  global: { fetch: watchedFetch },
})
