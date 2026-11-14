// Checks the code the admin shared. On success, creates the person if new and returns a one-time
// token the app exchanges for a normal Supabase session (no email is ever sent).
import { adminClient, cors, json, loadSettings, normalizePhone, sameCode } from '../_shared/util.ts'

const COLORS = ['#FFD3EF', '#C7B6F7', '#BFE3FF', '#BDF59A', '#FFE2B8', '#FFF59E']
const MAX_TRIES = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  let body: { phone?: unknown; code?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Send your phone number and code.' }, 400) }
  const phone = normalizePhone(body.phone)
  const code = String(body.code ?? '').replace(/\D/g, '')
  if (!phone || !code) return json({ error: 'Enter your phone number and the code you were sent.' }, 400)

  try {
    const db = adminClient()
    const s = await loadSettings(db)

    const { data: pending } = await db.from('otp_requests').select('*')
      .eq('phone', phone).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!pending) return json({ error: 'No code is waiting for this number. Ask for a new one.' }, 400)

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await db.from('otp_requests').update({ status: 'expired' }).eq('id', pending.id)
      return json({ error: 'That code has expired. Ask for a new one.' }, 400)
    }
    if (pending.attempts >= MAX_TRIES) {
      await db.from('otp_requests').update({ status: 'expired' }).eq('id', pending.id)
      return json({ error: 'Too many wrong tries. Ask for a new code.' }, 429)
    }
    if (!sameCode(code, pending.code)) {
      await db.from('otp_requests').update({ attempts: pending.attempts + 1 }).eq('id', pending.id)
      const left = MAX_TRIES - pending.attempts - 1
      return json({ error: left > 0 ? `That code isn’t right. ${left} tries left.` : 'That code isn’t right. Ask for a new one.' }, 400)
    }
    await db.from('otp_requests').update({ status: 'used', used_at: new Date().toISOString() }).eq('id', pending.id)

    const { data: existing } = await db.from('profiles').select('*').eq('phone', phone).maybeSingle()
    if (existing?.blocked) return json({ error: `This number can’t sign in. Ask ${s.admin_name}.` }, 403)

    // Every person is a Supabase Auth user with an internal address; nothing is ever emailed to it.
    const email = `${phone.slice(1)}@members.pro11.app`
    if (!existing) {
      const { error: createErr } = await db.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { name: pending.name, phone },
      })
      if (createErr && !/already|exists|registered/i.test(createErr.message)) throw createErr
    }

    const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkErr || !link?.properties?.hashed_token || !link.user) throw linkErr ?? new Error('No token')
    const userId = link.user.id

    const isAdminPhone = phone === s.admin_phone
    if (!existing) {
      const { error: insErr } = await db.from('profiles').insert({
        id: userId, name: pending.name, phone, role: isAdminPhone ? 'admin' : 'member',
        color: COLORS[Math.floor(Math.random() * COLORS.length)], last_seen_at: new Date().toISOString(),
      })
      if (insErr) throw insErr
      await db.rpc('consume_invite', { p_user: userId, p_phone: phone })   // role and starting balance from Add member
    } else {
      await db.from('profiles').update({
        last_seen_at: new Date().toISOString(), ...(isAdminPhone && existing.role !== 'admin' ? { role: 'admin' } : {}),
      }).eq('id', existing.id)
    }

    return json({
      ok: true,
      tokenHash: link.properties.hashed_token,
      sessionEpoch: s.session_epoch,
      sessionDays: s.session_days,
      isNew: !existing,
    })
  } catch (e) {
    console.error('verify-code', e)
    return json({ error: 'Couldn’t sign you in right now. Try again in a minute.' }, 500)
  }
})
