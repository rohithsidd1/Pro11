# Deploy this version (one time)

Everything below is safe to run again if you're unsure whether you already did it.

1. **Database** · Supabase → SQL Editor → paste `pro11-final-database.sql` → Run (choose Run if it warns).
   It contains steps 5, 6 and 7 (Fantasy XI, ranks, and everything else). Steps 1–4 and the automation update must already be in.

2. **Code** · copy the new files into your `pro11` folder and push. Netlify builds and deploys by itself.
   ```bash
   cd ~/Downloads
   rsync -av --exclude '.git' --exclude 'node_modules' --exclude '.env.local' "pro11 2/" pro11/
   cd pro11 && git add . && git commit -m "Pro11 complete" && git push
   ```

3. **Functions** · four functions changed or are new. Make a fresh token at
   supabase.com/dashboard/account/tokens (delete old ones), never paste it in a chat, then:
   ```bash
   export SUPABASE_ACCESS_TOKEN=your_new_token
   for f in sync-cricket send-push request-code verify-code; do
     npx supabase functions deploy $f --no-verify-jwt --project-ref mdtqgovuodwspxztsvps
   done
   unset SUPABASE_ACCESS_TOKEN
   ```
   Delete the token afterwards.

4. **Turn syncing on** · Admin → Cricket data → make sure "Pause all syncing" is off.

Nothing else: no new secrets, no new settings. Phone alerts create their own keys the first time someone turns them on.
