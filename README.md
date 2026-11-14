# Pro11

Cricket games for the family. React + Vite + TypeScript PWA, Supabase backend, hosted on Netlify. Everything runs on free tiers.

**Build progress:** Step 2 of 7, Cricket data ✅

| Step | What | Status |
|---|---|---|
| 1 | Design system, app shell, database, admin-relayed sign-in, members | ✅ |
| 2 | Cricket data sync (90-credit cap), match list, match screen | ✅ This drop |
| 3 | Wallet: UPI pay link + QR, screenshot reading, approvals, withdrawals | Next |
| 4 | Game 1: Predict the XI, end to end | |
| 5 | Game 2: Fantasy XI, end to end | |
| 6 | Admin rules and settings, notifications, ranks, history, backups | |
| 7 | Tablet/desktop polish, final checks | |

---

## One-time setup

### 0. Rotate the secret key (do this first)
The Supabase secret key was shared in a chat, so treat it as leaked:
Supabase → **Settings → API Keys** → create a new secret key → delete the old one.
Never put the secret key in code, `.env` files, GitHub or chats. The server functions read it automatically.

### 1. Create the database
Supabase → **SQL Editor → New query** → paste all of
`supabase/migrations/20261114000001_foundation.sql` → **Run**.

Check your UPI ID (it came through voice transcription as `77992923-2@ybl`):
```sql
select upi_id, payee_name from app_settings;
-- fix it if needed:
update app_settings set upi_id = '7799292381@ybl' where id = 1;
```

### 2. Deploy the two sign-in functions
They must run without the platform JWT check, because nobody has a session yet when they ask for a code.
```bash
npx supabase login
npx supabase link --project-ref mdtqgovuodwspxztsvps
npx supabase functions deploy request-code --no-verify-jwt
npx supabase functions deploy verify-code  --no-verify-jwt
```
Leave **Authentication → Providers → Email** enabled (it is by default). No emails are ever sent: each person gets an internal address like `917799292381@members.pro11.app` that only exists to hold their session.

### 3. Run it locally
```bash
npm install
cp .env.example .env.local     # both values are public, already filled in
npm run dev                    # http://localhost:5173
```

### 4. Your first sign-in (as admin)
1. Sign in with your name and **7799292381**, tap **Request code**.
2. You're the admin, so nobody can WhatsApp you the code yet. Open Supabase → **Table Editor → otp_requests**, copy the `code` of the newest row.
3. Enter it. You land in the app as **Admin** (your number is set as admin in `app_settings`).

After that, your sign-ins last 30 days. If you ever need a code again and you're signed in on another device, it's in **Admin → Sign-in codes**; otherwise use the table again.

### 5. Test a family sign-in
On another phone or browser: sign in with a different name and number. The code appears in **Admin → Sign-in codes** within a few seconds. Tap **Send on WhatsApp**, enter the code on the other device.

### 6. Push to GitHub
```bash
git init
git add .
git commit -m "Step 1: foundation"
git branch -M main
git remote add origin https://github.com/rohithsidd1/Pro11.git
git push -u origin main
```

### 7. Netlify (whenever you're ready)
**Add new site → Import from Git →** pick `Pro11`. Build settings come from `netlify.toml`.
Add the two environment variables from `.env.example` under **Site configuration → Environment variables**, then deploy.

---

---

## Step 2 setup: cricket data

CricketData blocks requests from Supabase's servers, so the calls go through a small Netlify function
(`netlify/functions/cricket.mts`). The Supabase sync function keeps all the logic (credit limit, logging, parsing).

1. **Database:** Supabase → SQL Editor → paste `supabase/migrations/20261114000002_matches.sql` → Run → **Run and enable RLS**.
2. **Netlify site:** Add new site → Import from Git → `rohithsidd1/Pro11`. Build settings come from `netlify.toml`.
3. **Netlify environment variables** (Site configuration → Environment variables), then **Deploys → Trigger deploy**:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://mdtqgovuodwspxztsvps.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key from `.env.example` |
   | `CRICKETDATA_API_KEY` | your CricketData key |
   | `CRICKET_PROXY_TOKEN` | a long random string: run `openssl rand -hex 24` |
4. **Supabase secrets** (Edge Functions → Secrets):
   | Name | Value |
   |---|---|
   | `CRICKET_PROXY_URL` | `https://YOUR-SITE.netlify.app/.netlify/functions/cricket` |
   | `CRICKET_PROXY_TOKEN` | the same random string as on Netlify |
5. **Deploy the sync function** (needs a Supabase access token in `SUPABASE_ACCESS_TOKEN`, see step 1 notes):
   ```bash
   npx supabase functions deploy sync-cricket --no-verify-jwt --project-ref mdtqgovuodwspxztsvps
   ```
6. **First sync:** in the app, **Admin → Cricket data → Refresh match list**. Matches appear on Home.

### How the credit budget works
- Every CricketData response reports what it cost (`hitsUsed`) and the day's total (`hitsToday`). The function logs both, so **Recent API calls** shows real numbers.
- Before every call, the function checks your **Daily credit limit** (default 90 of the API's 100). If a call would go over, it's skipped and logged.
- The job runs hourly but only calls the API when something is due, so most ticks cost nothing.
- Expected daily cost with defaults: match list 8 × 1–2 credits + fixtures 2 × 1 = about 10–18 credits. Squads (about 10 credits each) are only fetched by you for now; step 4 fetches them automatically for matches with games.

### What to test in step 2
- Refresh match list, then Home: Today / Tomorrow / Live tabs and the T20 / ODI / Test / Women filters
- National teams show flags; other teams show the logo from the API, or initials if there's none
- A match screen: time in India time, venue, toss, live scores, result
- As admin on a match screen: **Refresh match** (1 credit) and **Fetch squads** (about 10)
- Admin → Matches: **Follow filters / Always show / Hide** for a match, and see it change on Home
- Admin → Cricket data: change the filters (for example turn on Domestic), the limit, pause syncing
- Set the daily limit to a number you've already reached and tap Refresh: the call is skipped and logged, not made
- Supabase → **Integrations → Cron** (or Database → Cron): the `pro11-cricket-tick` job runs every hour

## What to test in step 1
- Welcome → Sign in → Enter code on a phone and on a computer
- Wrong code (shows tries left), expired code, **Get a new code**, more than 3 requests in an hour (blocked)
- Admin: codes appear and count down, **Copy**, **Send on WhatsApp**, **Cancel this code**
- Members: make someone admin, block someone (they're signed out on their next visit), "Can join games"
- Me: change name, avatar color, UPI ID
- Admin → **Sign everyone out** (everyone needs a new code, including you)
- Turn off the network after signing in and reload: you should see **Try again**, not be signed out
- Install as an app (Add to Home Screen / browser install icon)

## How sign-in works
1. `request-code` makes a code, stores it in `otp_requests`, and returns nothing secret to the person.
2. The admin sees the code (row level security lets only admins read that table) and shares it.
3. `verify-code` checks it (5 tries, expiry from settings), creates the person on first sign-in, and returns a one-time token. The app swaps it for a normal Supabase session.
4. Sessions end after `session_days`, when the admin bumps `session_epoch` (Sign everyone out), or when someone is blocked.

## Project layout
```
src/
  components/   Shell (sidebar + bottom nav), Icon, Avatar, OtpInput, CodeCard, WelcomeArt, Guards
  lib/          supabase client, auth session, api helper, phone/time helpers, toasts
  pages/auth/   Welcome, SignIn, EnterCode, SignedOut
  pages/admin/  AdminHome, SignInCodes, Members
  pages/        Home, Profile (Me), ComingSoon
  styles/       app.css — the design system from the approved mockups
supabase/
  migrations/   SQL, applied in order
  functions/    request-code, verify-code, _shared
```

## Secrets (set them yourself, never in code)
`CRICKETDATA_API_KEY` lives in Supabase → Edge Functions → Secrets. Nothing secret is stored in this repo.
