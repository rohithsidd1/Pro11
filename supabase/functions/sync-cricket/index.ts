// Pro11 cricket sync (Cricbuzz). Called by:
//   • the database job every minute (header x-sync-token) with { mode: "tick" }
//   • the admin app (signed-in admin) with { mode: "sync-now" | "list" | "fixtures" | "info" | …, matchId? }
//   • a member who just joined a game with { mode: "squad-for-entry", matchId }
// All reading of Cricbuzz happens in cricbuzz.ts through the Netlify reader.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, cors, json } from '../_shared/util.ts'
import { cbManual, tickCricbuzz } from './cricbuzz.ts'

interface Caller { userId: string | null; isAdmin: boolean }

async function authorize(req: Request, db: SupabaseClient): Promise<Caller | null> {
  const token = req.headers.get('x-sync-token')
  if (token) {
    const { data } = await db.rpc('sync_token_ok', { p_token: token })
    return data === true ? { userId: null, isAdmin: false } : null
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data: u } = await db.auth.getUser(jwt)
  if (!u?.user) return null
  const { data: p } = await db.from('profiles').select('role, blocked').eq('id', u.user.id).maybeSingle()
  if (!p || p.blocked) return null
  return { userId: u.user.id, isAdmin: p.role === 'admin' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  try {
    const db = adminClient()
    const caller = await authorize(req, db)
    if (!caller) return json({ error: 'Not allowed.' }, 401)
    const { data: s, error } = await db.from('app_settings').select('*').eq('id', 1).single()
    if (error || !s) return json({ error: 'Settings missing. Run the database update.' }, 500)
    const ctx = { db, s }
    const body = (await req.json().catch(() => ({}))) as { mode?: string; matchId?: string }
    const mode = body.mode ?? 'tick'
    const matchId = body.matchId ? String(body.matchId) : null

    if (mode === 'tick' && !caller.userId) return json({ ok: true, result: await tickCricbuzz(ctx) })
    if (mode === 'squad-for-entry' && matchId && caller.userId) {
      const { data: mine } = await db.from('entries').select('id, contests!inner(match_id)').eq('user_id', caller.userId).eq('contests.match_id', matchId).limit(1)
      if (!mine?.length) return json({ error: 'Join the game first.' }, 403)
      return json({ ok: true, result: await cbManual(ctx, 'squad-for-entry', matchId) })
    }
    if (!caller.isAdmin) return json({ error: 'Not allowed.' }, 401)
    const r = await cbManual(ctx, mode, matchId)
    return r ? json({ ok: true, result: r }) : json({ error: 'Unknown request.' }, 400)
  } catch (e) {
    console.error('sync-cricket', e)
    return json({ error: 'Sync failed. Check the function logs.' }, 500)
  }
})
