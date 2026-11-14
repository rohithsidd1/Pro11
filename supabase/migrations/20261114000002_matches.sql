-- =====================================================================
-- Pro11 · Step 2: cricket data
-- Matches, teams, squads, API credit budget, hourly sync job.
-- Run once in Supabase → SQL Editor (after step 1).
-- =====================================================================

-- ---------- Settings for cricket data ----------
alter table public.app_settings
  add column if not exists daily_credit_cap     int     not null default 90 check (daily_credit_cap between 1 and 100000),
  add column if not exists list_refresh_hours   int     not null default 3  check (list_refresh_hours between 1 and 24),
  add column if not exists fixtures_refresh_hours int   not null default 12 check (fixtures_refresh_hours between 1 and 48),
  add column if not exists fixtures_pages       int     not null default 1  check (fixtures_pages between 0 and 5),
  add column if not exists show_men_intl        boolean not null default true,
  add column if not exists show_women_intl      boolean not null default true,
  add column if not exists show_leagues         boolean not null default true,
  add column if not exists show_domestic        boolean not null default false,
  add column if not exists sync_paused          boolean not null default false,
  add column if not exists last_list_sync_at    timestamptz,
  add column if not exists last_fixtures_sync_at timestamptz;

-- ---------- Teams (logos and colours, editable by the admin later) ----------
create table if not exists public.teams (
  key         text primary key,               -- lower-case team name
  name        text not null,
  short_name  text,
  img         text,                           -- logo from the cricket API
  custom_img  text,                           -- admin upload (step 6)
  color       text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at  timestamptz not null default now()
);

-- ---------- Matches ----------
create table if not exists public.matches (
  id            text primary key,             -- CricketData match id
  name          text not null,
  label         text,                         -- "3rd T20I"
  series_name   text,
  series_id     text,
  match_type    text,                         -- raw: t20 / odi / test
  format        text not null default 'Other' check (format in ('T20', 'ODI', 'Test', 'Other')),
  category      text not null default 'other' check (category in ('international', 'league', 'domestic', 'other')),
  is_women      boolean not null default false,
  venue         text,
  starts_at     timestamptz not null,
  team_a        text not null,
  team_b        text not null,
  team_a_short  text,
  team_b_short  text,
  team_a_img    text,
  team_b_img    text,
  status_text   text,
  started       boolean not null default false,
  ended         boolean not null default false,
  toss_winner   text,
  toss_choice   text,
  winner        text,
  score         jsonb not null default '[]'::jsonb,
  has_squad     boolean not null default false,
  fantasy_ok    boolean not null default false,
  visibility    text not null default 'auto' check (visibility in ('auto', 'shown', 'hidden')),
  squad_fetched_at timestamptz,
  info_fetched_at  timestamptz,
  last_synced_at   timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists matches_starts_at on public.matches (starts_at);
create index if not exists matches_live on public.matches (started, ended);

-- ---------- Squads (Playing XI flags arrive in step 4) ----------
create table if not exists public.match_players (
  match_id   text not null references public.matches (id) on delete cascade,
  player_id  text not null,
  name       text not null,
  team       text not null,
  role       text not null default 'BAT' check (role in ('WK', 'BAT', 'AR', 'BOWL')),
  api_role   text,
  img        text,
  in_xi      boolean,                          -- null until the XI is known
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists match_players_match on public.match_players (match_id, team);

-- ---------- API budget ----------
create table if not exists public.api_usage (
  day         date primary key,                -- UTC day, the API's own counting day
  credits     int not null default 0,
  calls       int not null default 0,
  hits_today  int,                             -- as reported by the API
  hits_limit  int,
  updated_at  timestamptz not null default now()
);

create table if not exists public.api_calls (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  endpoint   text not null,
  match_id   text,
  credits    int not null default 0,
  ok         boolean not null default true,
  trigger    text not null default 'auto' check (trigger in ('auto', 'admin')),
  note       text
);
create index if not exists api_calls_at on public.api_calls (at desc);

-- ---------- What the app shows (applies the admin's filters) ----------
create or replace view public.match_feed with (security_invoker = true) as
select m.*
from public.matches m
cross join public.app_settings s
where s.id = 1
  and (
    m.visibility = 'shown'
    or (m.visibility = 'auto' and (
         (m.category = 'international' and not m.is_women and s.show_men_intl)
      or (m.category = 'international' and m.is_women and s.show_women_intl)
      or (m.category = 'league' and s.show_leagues)
      or (m.category in ('domestic', 'other') and s.show_domestic)
    ))
  );

-- ---------- Security ----------
alter table public.teams         enable row level security;
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;
alter table public.api_usage     enable row level security;
alter table public.api_calls     enable row level security;

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (true);
drop policy if exists matches_read on public.matches;
create policy matches_read on public.matches for select to authenticated using (true);
drop policy if exists players_read on public.match_players;
create policy players_read on public.match_players for select to authenticated using (true);
drop policy if exists usage_admin_read on public.api_usage;
create policy usage_admin_read on public.api_usage for select to authenticated using (public.is_admin());
drop policy if exists calls_admin_read on public.api_calls;
create policy calls_admin_read on public.api_calls for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.teams, public.matches, public.match_players, public.api_usage, public.api_calls
  from anon, authenticated;
grant select on public.match_feed to authenticated;

-- Admin: show / hide a match
create or replace function public.admin_set_match_visibility(p_id text, p_visibility text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  if p_visibility not in ('auto', 'shown', 'hidden') then raise exception 'Bad visibility'; end if;
  update public.matches set visibility = p_visibility where id = p_id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'matches', 'set_visibility', jsonb_build_object('match', p_id, 'visibility', p_visibility));
end $$;
revoke all on function public.admin_set_match_visibility(text, text) from public, anon;
grant execute on function public.admin_set_match_visibility(text, text) to authenticated;

-- Admin: cricket data settings
create or replace function public.admin_update_data_settings(
  p_daily_credit_cap int, p_list_refresh_hours int, p_fixtures_refresh_hours int, p_fixtures_pages int,
  p_show_men_intl boolean, p_show_women_intl boolean, p_show_leagues boolean, p_show_domestic boolean, p_sync_paused boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can change settings'; end if;
  update public.app_settings set
    daily_credit_cap = p_daily_credit_cap, list_refresh_hours = p_list_refresh_hours,
    fixtures_refresh_hours = p_fixtures_refresh_hours, fixtures_pages = p_fixtures_pages,
    show_men_intl = p_show_men_intl, show_women_intl = p_show_women_intl, show_leagues = p_show_leagues,
    show_domestic = p_show_domestic, sync_paused = p_sync_paused, updated_at = now()
  where id = 1;
  insert into public.audit_log (actor_id, area, action) values (auth.uid(), 'settings', 'update_cricket_data');
end $$;
revoke all on function public.admin_update_data_settings(int, int, int, int, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_update_data_settings(int, int, int, int, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- ---------- Hourly sync job ----------
-- A random token only the database and the sync function know, so the job needs no secret keys.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.sync_config (
  id    int primary key default 1 check (id = 1),
  token text not null default encode(gen_random_bytes(24), 'hex')
);
insert into private.sync_config (id) values (1) on conflict (id) do nothing;
alter table private.sync_config enable row level security;  -- no policies: only the database itself reads it

create or replace function public.sync_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.sync_config where id = 1 and token = p_token);
$$;
revoke all on function public.sync_token_ok(text) from public, anon, authenticated;
grant execute on function public.sync_token_ok(text) to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Every hour at :07 the job "ticks". The function decides what is due (list every 3 h by default),
-- so a tick usually costs 0 credits.
select cron.unschedule('pro11-cricket-tick') where exists (select 1 from cron.job where jobname = 'pro11-cricket-tick');
select cron.schedule(
  'pro11-cricket-tick',
  '7 * * * *',
  $job$
  select net.http_post(
    url     := 'https://mdtqgovuodwspxztsvps.supabase.co/functions/v1/sync-cricket',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-sync-token', (select token from private.sync_config where id = 1)),
    body    := '{"mode":"tick"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
