// Someone asks to sign in. We make a code and store it; the admin sees it and shares it on WhatsApp.
import { adminClient, cors, json, loadSettings, normalizePhone, randomCode } from '../_shared/util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  let body: { name?: unknown; phone?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Send your name and phone number.' }, 400) }

  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  const phone = normalizePhone(body.phone)
  if (name.length < 2 || name.length > 40) return json({ error: 'Enter your name, 2 to 40 letters.' }, 400)
  if (!phone) return json({ error: 'Enter a 10-digit Indian mobile number.' }, 400)

  try {
    const db = adminClient()
    const s = await loadSettings(db)
    const { data: member } = await db.from('profiles').select('id, blocked').eq('phone', phone).maybeSingle()
    if (member?.blocked) return json({ error: `This number can’t sign in. Ask ${s.admin_name}.` }, 403)

    const isAdminPhone = phone === s.admin_phone
    const now = Date.now()

    if (s.members_only_codes && !member && !isAdminPhone) {
      await db.from('otp_requests').insert({
        phone, name, code: '-', status: 'blocked', is_member: false, expires_at: new Date(now).toISOString(),
      })
      return json({ error: `This number isn’t on the members list yet. Ask ${s.admin_name} to add you.` }, 403)
    }

    const since = new Date(now - 60 * 60 * 1000).toISOString()
    const { count } = await db.from('otp_requests').select('id', { count: 'exact', head: true })
      .eq('phone', phone).gte('created_at', since)
    if ((count ?? 0) >= s.code_requests_per_hour) {
      return json({ error: 'Too many codes asked for this hour. Try again later.' }, 429)
    }

    await db.from('otp_requests').update({ status: 'expired' }).eq('phone', phone).eq('status', 'pending')

    const code = randomCode(s.code_length)
    const expiresAt = new Date(now + s.code_ttl_minutes * 60 * 1000).toISOString()
    const { error } = await db.from('otp_requests').insert({
      phone, name, code, is_member: Boolean(member) || isAdminPhone, expires_at: expiresAt,
    })
    if (error) throw error

    // Step 6 adds a push notification to the admin's devices here.
    return json({ ok: true, expiresAt, codeLength: s.code_length, adminName: s.admin_name, forAdmin: isAdminPhone, sessionDays: s.session_days })
  } catch (e) {
    console.error('request-code', e)
    return json({ error: 'Couldn’t make a code right now. Try again in a minute.' }, 500)
  }
})
