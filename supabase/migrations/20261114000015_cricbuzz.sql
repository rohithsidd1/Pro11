-- =====================================================================
-- Pro11 · Cricbuzz as the data source (unofficial, free, no credits)
--   • Matches, schedules, squads with roles, toss, Playing XI, live scorecards: read from Cricbuzz by the
--     Netlify function "cricbuzz"; Pro11 calculates fantasy points itself (rules editable in Game rules).
--   • CricketData stays available as a switch (Cricket data → Data source).
--   • The sync job runs every 5 minutes (it only fetches what is due).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================
alter table public.app_settings
  add column if not exists data_source         text not null default 'cricbuzz' check (data_source in ('cricbuzz', 'cricketdata')),
  add column if not exists cb_list_minutes     int  not null default 30 check (cb_list_minutes between 10 and 360),
  add column if not exists cb_live_minutes     int  not null default 5  check (cb_live_minutes between 3 and 60),
  add column if not exists cb_schedule_hours   int  not null default 12 check (cb_schedule_hours between 1 and 72),
  add column if not exists last_cb_list_at     timestamptz,
  add column if not exists last_cb_schedule_at timestamptz,
  add column if not exists cb_health           jsonb not null default '{}'::jsonb,
  add column if not exists fx_rules            jsonb not null default '{}'::jsonb;

alter table public.matches
  add column if not exists cb_slug       text,
  add column if not exists cb_info_at    timestamptz,
  add column if not exists cb_live_at    timestamptz,
  add column if not exists time_verified boolean not null default false,
  add column if not exists toss_text     text;

-- Player roles learned from Cricbuzz, kept for every later match
create table if not exists public.cb_players (
  profile_id text primary key,
  name       text not null,
  slug       text,
  role       text check (role in ('WK', 'BAT', 'AR', 'BOWL')),
  checked_at timestamptz not null default now()
);
alter table public.cb_players enable row level security;
drop policy if exists cb_players_read on public.cb_players;
create policy cb_players_read on public.cb_players for select to authenticated using (true);
revoke insert, update, delete on public.cb_players from anon, authenticated;

-- every 5 minutes
select cron.unschedule('pro11-cricket-tick') where exists (select 1 from cron.job where jobname = 'pro11-cricket-tick');
select cron.schedule(
  'pro11-cricket-tick',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := 'https://mdtqgovuodwspxztsvps.supabase.co/functions/v1/sync-cricket',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-sync-token', (select token from private.sync_config where id = 1)),
    body    := '{"mode":"tick"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- ---------- The 5-minute job: lock times are refreshed before locking; an XI that arrived early is scored at the lock ----------
create or replace function public.process_contests()
returns int language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; n int := 0; players int;
begin
  select * into s from public.app_settings where id = 1;
  -- keep open games' lock time in step with the match time FIRST, so a game never locks late
  update public.contests ct set lock_at = public.lock_time_for(ct.match_id, ct.game)
  where ct.status = 'open' and ct.lock_at is distinct from public.lock_time_for(ct.match_id, ct.game)
    and public.lock_time_for(ct.match_id, ct.game) is not null;
  for c in select ct.*, m.team_a, m.team_b, m.team_a_short, m.team_b_short from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.status = 'open' and ct.reminded_at is null and ct.lock_at > now() and ct.lock_at <= now() + make_interval(mins => s.n_lock_minutes) loop
    update public.contests set reminded_at = now() where id = c.id;
    perform public.notify(e.user_id, 'lock_soon',
      format('%s locks at %s', case c.game when 'xi' then 'Predict the XI' else 'Fantasy XI' end, to_char(c.lock_at at time zone 'Asia/Kolkata', 'HH24:MI')),
      format('%s vs %s. Last chance to change your %s.', coalesce(c.team_a_short, c.team_a), coalesce(c.team_b_short, c.team_b), case c.game when 'xi' then 'picks' else 'team' end),
      '/match/' || c.match_id || case c.game when 'xi' then '/xi' else '/fantasy' end)
    from public.entries e where e.contest_id = c.id;
  end loop;
  for c in select * from public.contests where status = 'open' and lock_at <= now() for update skip locked loop
    select count(*) into players from public.entries where contest_id = c.id;
    if players = 0 then
      update public.contests set status = 'cancelled', cancel_reason = 'Nobody joined', settled_at = now() where id = c.id;
    elsif players < s.min_players then
      perform public.refund_contest(c.id, format('Fewer than %s players joined', s.min_players));
    else
      update public.contests set status = 'locked' where id = c.id;
    end if;
    n := n + 1;
  end loop;
  for c in select distinct ct.match_id from public.contests ct
           where ct.game = 'xi' and ct.status = 'locked' and public.xi_complete(ct.match_id) loop
    perform public.score_match_xi(c.match_id); n := n + 1;
  end loop;
  for c in select ct.id from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.game = 'xi' and ct.status = 'locked' and not public.xi_complete(ct.match_id)
             and ((m.ended and (m.xi_points_checked_at is not null or m.final_points_at is not null)) or ct.lock_at < now() - interval '12 hours') loop
    perform public.refund_contest(c.id, 'CricketData didn’t publish the Playing XI'); n := n + 1;
  end loop;
  for c in select ct.id from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.game = 'fantasy' and ct.status = 'locked'
             and ct.lock_at < now() - case when m.format = 'Test' then interval '7 days' else interval '3 days' end loop
    perform public.refund_contest(c.id, 'CricketData didn’t publish the final points'); n := n + 1;
  end loop;
  for c in select id from public.contests where status = 'scored' and scored_at < now() - interval '30 minutes' loop
    perform public.settle_contest(c.id);
    perform public.notify_payout(c.id);
    n := n + 1;
  end loop;
  return n;
end $$;
