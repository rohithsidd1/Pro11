-- =====================================================================
-- Pro11 · Upcoming matches done right
--   • Members see matches that haven't started (today, tomorrow, later), plus matches they joined
--     (live ones, and finished ones in My games). Finished matches nobody joined are hidden.
--   • Upcoming matches are listed even before squads are out; games open once CricketData has the squad.
--   • Match list every 6 hours (all pages). The 17,113-row "fixtures" list is replaced by the schedules of
--     the series being played (1 credit per series, once a day, up to 8 series).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- "Fixture pages" becomes "series schedules per day" (0 turns schedules off)
alter table public.app_settings drop constraint if exists app_settings_fixtures_pages_check;
alter table public.app_settings add constraint app_settings_fixtures_pages_check check (fixtures_pages between 0 and 20);
alter table public.app_settings alter column fixtures_pages set default 8;
alter table public.app_settings alter column list_refresh_hours set default 6;
alter table public.app_settings alter column fixtures_refresh_hours set default 24;
update public.app_settings set list_refresh_hours = 6 where id = 1 and list_refresh_hours = 3;
update public.app_settings set fixtures_refresh_hours = 24 where id = 1 and fixtures_refresh_hours = 12;
update public.app_settings set fixtures_pages = 8 where id = 1 and fixtures_pages = 1;

create table if not exists public.series_schedule_checks (
  series_id  text primary key,
  checked_at timestamptz not null default now(),
  matches    int not null default 0
);
alter table public.series_schedule_checks enable row level security;
drop policy if exists series_schedule_read on public.series_schedule_checks;
create policy series_schedule_read on public.series_schedule_checks for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.series_schedule_checks from anon, authenticated;

-- Can games run yet? (CricketData flags a squad, or squads are already loaded for this match or its series)
create or replace function public.squads_ready(p_match text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(m.has_squad, false)
      or exists (select 1 from public.match_players mp where mp.match_id = m.id)
      or (select count(distinct lower(sp.team)) from public.series_players sp
          where sp.series_id = m.series_id and lower(sp.team) in (lower(m.team_a), lower(m.team_b))) = 2
  from public.matches m where m.id = p_match;
$$;
revoke all on function public.squads_ready(text) from public, anon;
grant execute on function public.squads_ready(text) to authenticated, service_role;

-- Join only once squads are out (everything else unchanged)
create or replace function public.join_contest(p_match text, p_game text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; s public.app_settings; bal int; v_entry uuid; players int;
begin
  me := public.require_member();
  if not me.can_play then raise exception 'You can’t join games right now. Ask the admin.'; end if;
  if not coalesce(public.squads_ready(p_match), false) then raise exception 'Games open once the squads are announced'; end if;
  c := public.ensure_contest(p_match, p_game);
  select * into s from public.app_settings where id = 1;
  if not c.enabled then raise exception 'This game isn’t running for this match'; end if;
  if c.status <> 'open' or now() >= c.lock_at then raise exception 'This game has locked'; end if;
  if exists (select 1 from public.entries where contest_id = c.id and user_id = me.id) then raise exception 'You’ve already joined'; end if;
  perform 1 from public.contests where id = c.id for update;
  select count(*) into players from public.entries where contest_id = c.id;
  if players >= coalesce(c.max_players, s.max_players) then raise exception 'This game is full (% players)', coalesce(c.max_players, s.max_players); end if;
  perform 1 from public.profiles where id = me.id for update;
  bal := public.wallet_balance(me.id);
  if bal < c.fee then raise exception 'You need ₹% more to join. Add money first.', c.fee - bal; end if;
  insert into public.entries (contest_id, user_id) values (c.id, me.id) returning id into v_entry;
  if c.fee > 0 then
    insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
    values (me.id, -c.fee, 'entry', v_entry, public.contest_label(c.id), me.id);
  end if;
  return v_entry;
end $$;

-- Members' list: upcoming matches with fantasy data, plus any match you joined (live or finished)
create or replace view public.match_feed with (security_invoker = true) as
select m.*
from public.matches m
cross join public.app_settings s
where s.id = 1
  and not exists (select 1 from public.blocked_series b where b.series_id = m.series_id)
  and (
    exists (select 1 from public.contests c join public.entries e on e.contest_id = c.id where c.match_id = m.id and e.user_id = auth.uid())
    or (
      not m.started and not m.ended and m.starts_at > now() - interval '30 minutes'
      and m.visibility <> 'hidden'
      and (m.visibility = 'shown' or (
           (m.category = 'international' and not m.is_women and s.show_men_intl)
        or (m.category = 'international' and m.is_women and s.show_women_intl)
        or (m.category = 'league' and s.show_leagues)
        or (m.category in ('domestic', 'other') and s.show_domestic)
      ))
      and (not s.only_game_ready or m.fantasy_ok or m.visibility = 'shown')
    )
  );
grant select on public.match_feed to authenticated;
