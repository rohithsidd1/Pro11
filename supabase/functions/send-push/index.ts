// Pro11 phone push alerts (Web Push, free).
//   • The database calls this for every new notification (header x-sync-token, body { id }).
//   • A signed-in member calls it with { mode: "key" } to get the public key their phone subscribes with.
// The VAPID key pair is created on first use and kept in public.push_config (readable only by this function).
import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, cors, json } from '../_shared/util.ts'

const SUBJECT = 'mailto:admin@pro11.app'

async function vapid(db: SupabaseClient): Promise<{ public_key: string; private_key: string }> {
  const { data } = await db.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle()
  if (data) return data
  const k = webpush.generateVAPIDKeys()
  await db.from('push_config').upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: 'id', ignoreDuplicates: true })
  const { data: again } = await db.from('push_config').select('public_key, private_key').eq('id', 1).single()
  return again!
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  try {
    const db = adminClient()
    const body = (await req.json().catch(() => ({}))) as { id?: string; mode?: string }
    const token = req.headers.get('x-sync-token')

    // A member asking for the public key
    if (!token) {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null }
      if (!u?.user) return json({ error: 'Sign in again.' }, 401)
      const keys = await vapid(db)
      return json({ publicKey: keys.public_key })
    }

    // The database pushing a notification
    const { data: ok } = await db.rpc('sync_token_ok', { p_token: token })
    if (ok !== true) return json({ error: 'Not allowed.' }, 401)
    if (!body.id) return json({ error: 'Missing id.' }, 400)
    const { data: n } = await db.from('notifications').select('id, user_id, kind, title, body, link').eq('id', body.id).maybeSingle()
    if (!n) return json({ ok: true, sent: 0 })
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id)
    if (!subs?.length) return json({ ok: true, sent: 0 })
    const keys = await vapid(db)
    const payload = JSON.stringify({ title: n.title, body: n.body ?? '', link: n.link ?? '/', tag: n.kind })
    let sent = 0
    for (const s of subs) {
      try {
        const d = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { TTL: 24 * 3600, urgency: 'normal', vapidDetails: { subject: SUBJECT, publicKey: keys.public_key, privateKey: keys.private_key } })
        const r = await fetch(d.endpoint, { method: d.method, headers: d.headers as Record<string, string>, body: d.body as unknown as BodyInit, signal: AbortSignal.timeout(8000) })
        if (r.status === 404 || r.status === 410) await db.from('push_subscriptions').delete().eq('id', s.id)   // phone unsubscribed
        else if (r.ok) sent++
      } catch (e) {
        console.error('push failed', String(e).slice(0, 160))
      }
    }
    return json({ ok: true, sent })
  } catch (e) {
    console.error('send-push', e)
    return json({ error: 'Push failed.' }, 500)
  }
})
