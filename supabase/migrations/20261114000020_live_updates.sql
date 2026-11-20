-- =====================================================================
-- Pro11 · Live updates: the database announces changes to the tables the screens show (Supabase Realtime),
-- so open screens update by themselves within a second. Each person only receives rows they're allowed to
-- read (the same row-level security as everywhere else).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['matches', 'contests', 'entries', 'xi_picks', 'fantasy_picks', 'match_players', 'player_points',
                           'ledger_lines', 'settlements', 'notifications'] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
