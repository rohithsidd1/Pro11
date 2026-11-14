import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** New projects expose secret keys as JSON in SUPABASE_SECRET_KEYS; older ones use SUPABASE_SERVICE_ROLE_KEY. */
function secretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>
      const k = keys['default'] ?? Object.values(keys)[0]
      if (k) return k
    } catch { /* fall through */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new Error('No secret key available to the function')
  return legacy
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Accepts 98765 43210, 098765..., 9198765..., +91 98765... → "+919876543210" or null. */
export function normalizePhone(input: unknown): string | null {
  const d = String(input ?? '').replace(/\D/g, '')
  let ten = d
  if (d.length === 12 && d.startsWith('91')) ten = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) ten = d.slice(1)
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null
}

export function randomCode(length: number): string {
  const buf = new Uint32Array(length)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => String(n % 10)).join('')
}

export function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type Settings = {
  admin_name: string; admin_phone: string; code_length: number; code_ttl_minutes: number
  session_days: number; code_requests_per_hour: number; members_only_codes: boolean; session_epoch: number
}

export async function loadSettings(db: SupabaseClient): Promise<Settings> {
  const { data, error } = await db.from('app_settings').select('*').eq('id', 1).single()
  if (error || !data) throw new Error('Settings missing. Run the database migration first.')
  return data as Settings
}
