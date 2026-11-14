// Pro11 · CricketData proxy (Netlify Function)
// CricketData blocks requests from Supabase's servers, so the Supabase sync function asks this
// function to make the call instead. Only allow-listed endpoints, only with the shared token.
// Environment variables (Netlify → Site configuration → Environment variables):
//   CRICKETDATA_API_KEY   your CricketData key
//   CRICKET_PROXY_TOKEN   a long random string, the same one stored in Supabase secrets

declare const process: { env: Record<string, string | undefined> }

const ALLOWED = new Set(['currentMatches', 'matches', 'match_info', 'match_squad', 'match_scorecard', 'match_points', 'series_info', 'series_squad'])
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ status: 'failure', reason: 'Use POST.' }, 405)

  const expected = process.env.CRICKET_PROXY_TOKEN
  if (!expected || req.headers.get('x-proxy-token') !== expected) return json({ status: 'failure', reason: 'Not allowed.' }, 401)

  const key = process.env.CRICKETDATA_API_KEY
  if (!key) return json({ status: 'failure', reason: 'CRICKETDATA_API_KEY is not set on Netlify.' }, 500)

  let body: { endpoint?: unknown; params?: Record<string, unknown> }
  try { body = await req.json() } catch { return json({ status: 'failure', reason: 'Bad request.' }, 400) }
  const endpoint = String(body.endpoint ?? '')
  if (!ALLOWED.has(endpoint)) return json({ status: 'failure', reason: `Endpoint not allowed: ${endpoint}` }, 400)

  const url = new URL(`https://api.cricapi.com/v1/${endpoint}`)
  for (const [k, v] of Object.entries(body.params ?? {})) {
    if (k.toLowerCase() !== 'apikey' && (typeof v === 'string' || typeof v === 'number')) url.searchParams.set(k, String(v))
  }
  url.searchParams.set('apikey', key)

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (e) {
    const reason = String(e).split(key).join('***').replace(/apikey=[^&\s)"]+/gi, 'apikey=***')
    return json({ status: 'failure', reason: `Proxy couldn’t reach CricketData: ${reason.slice(0, 160)}` }, 502)
  }
}
