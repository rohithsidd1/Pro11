-- =====================================================================
-- Pro11 · Spend credits only where CricketData has data
--   • only_game_ready (default ON): the app lists only matches CricketData marks as having fantasy
--     data AND a squad (fantasyEnabled + hasSquad from the free match list). Matches people already
--     joined, matches with squads, and matches you set to "Always show" stay visible.
--   • Series squads (1 credit for a whole series) are tried before the 10-credit match squad.
--   • auto_xi_check (default OFF): the 10-credit Playing XI check after the toss is opt-in.
-- =====================================================================
alter table public.app_settings
  add column if not exists only_game_ready boolean not null default true,
  add column if not exists auto_xi_check   boolean not null default false;

-- Squads per series (from the 1-credit series_squad call), reused for every match in the series.
create table if not exists public.series_players (
  series_id  text not null,
  team       text not null,
  player_id  text not null,
  name       text not null,
  role       text not null default 'BAT' check (role in ('WK', 'BAT', 'AR', 'BOWL')),
  api_role   text,
  img        text,
  updated_at timestamptz not null default now(),
  primary key (series_id, player_id)
);
create table if not exists public.series_squad_checks (
  series_id  text primary key,
  checked_at timestamptz not null default now(),
  players    int not null default 0
);
alter table public.series_players enable row level security;
alter table public.series_squad_checks enable row level security;
drop policy if exists series_players_read on public.series_players;
create policy series_players_read on public.series_players for select to authenticated using (true);
drop policy if exists series_checks_read on public.series_squad_checks;
create policy series_checks_read on public.series_squad_checks for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.series_players, public.series_squad_checks from anon, authenticated;

/** Copies a series squad into a match's squad (teams matched by name). Returns players added. */
create or replace function public.squad_from_series(p_match text)
returns int language plpgsql security definer set search_path = public as $$
declare m public.matches; n int;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or m.series_id is null then return 0; end if;
  insert into public.match_players (match_id, player_id, name, team, role, api_role, img)
  select m.id, sp.player_id, sp.name,
         case when lower(sp.team) = lower(m.team_a) then m.team_a else m.team_b end,
         sp.role, sp.api_role, sp.img
  from public.series_players sp
  where sp.series_id = m.series_id and lower(sp.team) in (lower(m.team_a), lower(m.team_b))
  on conflict (match_id, player_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.matches set squad_fetched_at = coalesce(squad_fetched_at, now()) where id = m.id; end if;
  return n;
end $$;
revoke all on function public.squad_from_series(text) from public, anon, authenticated;
grant execute on function public.squad_from_series(text) to service_role;

-- Members' match list: only matches with game data (unless you choose otherwise)
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
    ) and (
         not s.only_game_ready
      or (m.fantasy_ok and m.has_squad)
      or exists (select 1 from public.match_players mp where mp.match_id = m.id)
      or exists (select 1 from public.contests c join public.entries e on e.contest_id = c.id where c.match_id = m.id)
    ))
  );
grant select on public.match_feed to authenticated;

create or replace function public.admin_set_data_options(p_only_game_ready boolean, p_auto_xi_check boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can change settings'; end if;
  update public.app_settings set only_game_ready = p_only_game_ready, auto_xi_check = p_auto_xi_check, updated_at = now() where id = 1;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'settings', 'data_options', jsonb_build_object('only_game_ready', p_only_game_ready, 'auto_xi_check', p_auto_xi_check));
end $$;
revoke all on function public.admin_set_data_options(boolean, boolean) from public, anon;
grant execute on function public.admin_set_data_options(boolean, boolean) to authenticated;
