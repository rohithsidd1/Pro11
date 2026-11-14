# Deploy this version

Everything here is safe to run again if you're unsure whether you already did it.

1. **Database** · Supabase → SQL Editor → paste `pro11-database-update.sql` → Run (choose Run if it warns).
   Safe whether or not you ran any earlier database file. It also turns syncing back on.

2. **Functions** · two changed: `sync-cricket` and `verify-code`. Make a brand-new token at
   supabase.com/dashboard/account/tokens (delete every old one), never paste it in a chat, then from this folder:
   ```bash
   export SUPABASE_ACCESS_TOKEN=your_new_token
   for f in sync-cricket verify-code; do npx supabase functions deploy $f --no-verify-jwt --project-ref mdtqgovuodwspxztsvps; done
   unset SUPABASE_ACCESS_TOKEN
   ```
   Delete the token afterwards.

3. **Code** · copy the new files into your `pro11` folder and push. Netlify deploys by itself.
   ```bash
   cd ~/Downloads
   rsync -av --exclude '.git' --exclude 'node_modules' --exclude '.env.local' "pro11 2/" pro11/
   cd pro11 && git add . && git commit -m "Audit fixes" && git push
   ```

4. **Check** · Admin → Cricket data: syncing on; tap Refresh match list and Load schedules once.
