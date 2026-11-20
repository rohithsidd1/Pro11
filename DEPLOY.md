# Deploy this version (Cricbuzz data)

Safe to repeat any step.

1. **Database** · Supabase → SQL Editor → paste `pro11-database-update.sql` → Run (choose Run if it warns).
   Works whatever you ran before. Switches Pro11 to Cricbuzz and makes the sync run every 5 minutes.

2. **Code** · copy the new files into your `pro11` folder and push. Netlify deploys the app and the Cricbuzz reader.
   ```bash
   cd ~/Downloads && rm -rf /tmp/pro11-new && unzip -q -o pro11-update.zip -d /tmp/pro11-new && rsync -av --exclude '.git' --exclude 'node_modules' --exclude '.env.local' /tmp/pro11-new/pro11/ ~/Downloads/pro11/ && cd ~/Downloads/pro11 && git add . && git commit -m "Cricbuzz data" && git push
   ```

3. **Sync function** · make a NEW token at supabase.com/dashboard/account/tokens (delete old ones), then:
   ```bash
   cd ~/Downloads/pro11
   export SUPABASE_ACCESS_TOKEN=PASTE_NEW_TOKEN
   npx supabase functions deploy sync-cricket --no-verify-jwt --project-ref mdtqgovuodwspxztsvps
   unset SUPABASE_ACCESS_TOKEN
   ```

4. **Check** · after a minute open https://playpro11.netlify.app/.netlify/functions/cricbuzz?debug=1
   and send the result to Claude. Then Admin → Cricket data → Refresh match list and Load schedules.

No new keys or settings are needed.
