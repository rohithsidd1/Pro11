-- =====================================================================
-- Pro11 · Step 5: Game 2, Fantasy XI (fully automatic)
--   • Pick 11 (max 7 a side; WK 1–4, BAT 3–6, AR 1–4, BOWL 3–6), a captain (2×) and vice-captain (1.5×).
--   • Locks at the match start. Other teams stay hidden until then.
--   • Points come from CricketData's fantasy points: a live update around the innings break (optional)
--     and the final one when the match ends. The final points call is shared with Predict the XI.
--   • Abandoned / no result → both games refunded automatically. Pays out 30 minutes after final points.
-- =====================================================================

alter table public.app_settings
  add column if not exists fx_max_per_side   int not null default 7 check (fx_max_per_side between 6 and 11),
  add column if not exists fx_wk_min  int not null default 1, add column if not exists fx_wk_max  int not null default 4,
  add column if not exists fx_bat_min int not null default 3, add column if not exists fx_bat_max int not null default 6,
  add column if not exists fx_ar_min  int not null default 1, add column if not exists fx_ar_max  int not null default 4,
  add column if not exists fx_bowl_min int not null default 3, add column if not exists fx_bowl_max int not null default 6,
  add column if not exists fx_captain_mult numeric not null default 2   check (fx_captain_mult between 1 and 5),
  add column if not exists fx_vice_mult    numeric not null default 1.5 check (fx_vice_mult between 1 and 5),
  add column if not exists fx_live_update  boolean not null default true;

alter table public.matches
  add column if not exists live_points_at  timestamptz,   -- the one live (innings break) points call
  add column if not exists final_points_at timestamptz,   -- the one final points call (shared by both games)
  add column if not exists end_checked_at  timestamptz;   -- last 1-credit "has it finished?" check

-- Fantasy points per player per match (from CricketData's match_points).
create table if not exists public.player_points (
  match_id   text not null references public.matches (id) on delete cascade,
  player_id  text not null,
  points     numeric not null default 0,
  final      boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
alter table public.player_points enable row level security;
drop policy if exists player_points_read on public.player_points;
create policy player_points_read on public.player_points for select to authenticated using (true);
revoke insert, update, delete on public.player_points from anon, authenticated;

create table if not exists public.fantasy_picks (
  entry_id   uuid not null references public.entries (id) on delete cascade,
  player_id  text not null,
  team       text not null,
  role       text not null,
  captain    boolean not null default false,
  vice       boolean not null default false,
  primary key (entry_id, player_id)
);
alter table public.fantasy_picks enable row level security;
drop policy if exists fantasy_picks_read on public.fantasy_picks;
create policy fantasy_picks_read on public.fantasy_picks for select to authenticated using (public.can_see_picks(entry_id));
revoke insert, update, delete on public.fantasy_picks from anon, authenticated;

alter table public.contests add column if not exists live_at timestamptz;   -- when live points were last applied

-- ---------- Save a fantasy team ----------
create or replace function public.save_fantasy_team(p_contest uuid, p_players text[], p_captain text, p_vice text)
returns int language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; e public.entries; s public.app_settings; n int; r record; per_side int;
begin
  me := public.require_member();
  select * into c from public.contests where id = p_contest;
  if c.id is null or c.game <> 'fantasy' then raise exception 'Game not found'; end if;
  if c.status <> 'open' or now() >= c.lock_at then raise exception 'Teams are locked'; end if;
  select * into e from public.entries where contest_id = c.id and user_id = me.id;
  if e.id is null then raise exception 'Join the game first'; end if;
  select * into s from public.app_settings where id = 1;
  p_players := array(select distinct x from unnest(coalesce(p_players, '{}')) x);
  if array_length(p_players, 1) is distinct from 11 then raise exception 'Pick exactly 11 players'; end if;
  select count(*) into n from public.match_players where match_id = c.match_id and player_id = any (p_players);
  if n <> 11 then raise exception 'Some players aren’t in this match’s squads. Reload and try again.'; end if;
  select max(cnt) into per_side from (select count(*) cnt from public.match_players where match_id = c.match_id and player_id = any (p_players) group by team) t;
  if per_side > s.fx_max_per_side then raise exception 'At most % from one team', s.fx_max_per_side; end if;
  for r in select role, count(*) cnt from public.match_players where match_id = c.match_id and player_id = any (p_players) group by role loop
    if r.role = 'WK' and r.cnt > s.fx_wk_max then raise exception 'At most % wicketkeepers', s.fx_wk_max; end if;
    if r.role = 'BAT' and r.cnt > s.fx_bat_max then raise exception 'At most % batters', s.fx_bat_max; end if;
    if r.role = 'AR' and r.cnt > s.fx_ar_max then raise exception 'At most % all-rounders', s.fx_ar_max; end if;
    if r.role = 'BOWL' and r.cnt > s.fx_bowl_max then raise exception 'At most % bowlers', s.fx_bowl_max; end if;
  end loop;
  if (select count(*) from public.match_players where match_id = c.match_id and player_id = any (p_players) and role = 'WK') < s.fx_wk_min then raise exception 'Pick at least % wicketkeeper(s)', s.fx_wk_min; end if;
  if (select count(*) from public.match_players where match_id = c.match_id and player_id = any (p_players) and role = 'BAT') < s.fx_bat_min then raise exception 'Pick at least % batters', s.fx_bat_min; end if;
  if (select count(*) from public.match_players where match_id = c.match_id and player_id = any (p_players) and role = 'AR') < s.fx_ar_min then raise exception 'Pick at least % all-rounder(s)', s.fx_ar_min; end if;
  if (select count(*) from public.match_players where match_id = c.match_id and player_id = any (p_players) and role = 'BOWL') < s.fx_bowl_min then raise exception 'Pick at least % bowlers', s.fx_bowl_min; end if;
  if p_captain is null or p_vice is null or p_captain = p_vice then raise exception 'Choose a different captain and vice-captain'; end if;
  if not (p_captain = any (p_players) and p_vice = any (p_players)) then raise exception 'Captain and vice-captain must be in your team'; end if;
  delete from public.fantasy_picks where entry_id = e.id;
  insert into public.fantasy_picks (entry_id, player_id, team, role, captain, vice)
  select e.id, mp.player_id, mp.team, mp.role, mp.player_id = p_captain, mp.player_id = p_vice
  from public.match_players mp where mp.match_id = c.match_id and mp.player_id = any (p_players);
  update public.entries set updated_at = now() where id = e.id;
  return 11;
end $$;

-- ---------- Score fantasy games from stored points ----------
create or replace function public.score_fantasy_match(p_match text, p_final boolean)
returns int language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; n int := 0;
begin
  select * into s from public.app_settings where id = 1;
  for c in select * from public.contests where match_id = p_match and game = 'fantasy' and status in ('locked', 'scored') loop
    update public.entries e set
      points = coalesce((
        select sum(coalesce(pp.points, 0) * case when fp.captain then s.fx_captain_mult when fp.vice then s.fx_vice_mult else 1 end)
        from public.fantasy_picks fp left join public.player_points pp on pp.match_id = p_match and pp.player_id = fp.player_id
        where fp.entry_id = e.id), 0),
      updated_at = now()
    where e.contest_id = c.id;
    update public.entries e set rank = r.rk
    from (select id, rank() over (order by points desc) rk from public.entries where contest_id = c.id) r where e.id = r.id;
    if p_final then
      update public.contests set status = 'scored', scored_at = now(), live_at = now() where id = c.id;
      perform public.notify(e.user_id, 'contest_scored', public.contest_label(c.id) || ': final points are in',
        'Pays out in 30 minutes.', '/match/' || p_match || '/fantasy/results')
      from public.entries e where e.contest_id = c.id;
    else
      update public.contests set live_at = now() where id = c.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Abandoned / no result: refund every game on the match ----------
create or replace function public.refund_match(p_match text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  for c in select id from public.contests where match_id = p_match and status in ('open', 'locked', 'scored') loop
    perform public.refund_contest(c.id, p_reason); n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Results links: fantasy games point to their own results page ----------
create or replace function public.contest_label(p_contest uuid)
returns text language sql stable security definer set search_path = public as $$
  select (case c.game when 'xi' then 'Predict the XI' else 'Fantasy XI' end) || ', ' ||
         coalesce(m.team_a_short, m.team_a) || ' vs ' || coalesce(m.team_b_short, m.team_b)
  from public.contests c join public.matches m on m.id = c.match_id where c.id = p_contest;
$$;

create or replace function public.settle_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; pot int; top numeric; winners int; v_share int; v_extra int; v_amt int; w record; i int := 0;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status <> 'scored' then return 0; end if;
  select * into s from public.app_settings where id = 1;
  select c.fee * count(*), max(points) into pot, top from public.entries where contest_id = c.id;
  if s.tie_rule = 'earliest' then winners := 1; else select count(*) into winners from public.entries where contest_id = c.id and points = top; end if;
  v_share := pot / winners; v_extra := pot - v_share * winners;
  for w in select * from public.entries where contest_id = c.id and points = top order by created_at limit winners loop
    i := i + 1;
    v_amt := v_share + (case when i = 1 then v_extra else 0 end);
    update public.entries set payout = v_amt where id = w.id;
    if v_amt > 0 then
      insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
      values (w.user_id, v_amt, 'payout', w.id, 'Won ' || public.contest_label(c.id), auth.uid());
    end if;
  end loop;
  update public.contests set status = 'paid', settled_at = now(), settled_by = auth.uid() where id = c.id;
  perform public.notify(e.user_id, 'contest_paid', public.contest_label(c.id) || ': final results',
    case when e.payout > 0 then format('You won ₹%s!', e.payout) else 'See the final standings.' end,
    '/match/' || c.match_id || case c.game when 'xi' then '/xi/results' else '/fantasy/results' end)
  from public.entries e where e.contest_id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', case when auth.uid() is null then 'auto_settle' else 'settle_contest' end,
          jsonb_build_object('contest', c.id, 'pot', pot, 'winners', winners));
  return winners;
end $$;

-- ---------- Team rules (admin) ----------
create or replace function public.admin_update_team_rules(
  p_max_per_side int, p_wk_min int, p_wk_max int, p_bat_min int, p_bat_max int, p_ar_min int, p_ar_max int,
  p_bowl_min int, p_bowl_max int, p_captain numeric, p_vice numeric, p_live boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can change rules'; end if;
  if p_wk_min > p_wk_max or p_bat_min > p_bat_max or p_ar_min > p_ar_max or p_bowl_min > p_bowl_max then raise exception 'A minimum is bigger than its maximum'; end if;
  if p_wk_min + p_bat_min + p_ar_min + p_bowl_min > 11 then raise exception 'The minimums add up to more than 11'; end if;
  if p_wk_max + p_bat_max + p_ar_max + p_bowl_max < 11 then raise exception 'The maximums add up to less than 11'; end if;
  update public.app_settings set fx_max_per_side = p_max_per_side, fx_wk_min = p_wk_min, fx_wk_max = p_wk_max, fx_bat_min = p_bat_min,
    fx_bat_max = p_bat_max, fx_ar_min = p_ar_min, fx_ar_max = p_ar_max, fx_bowl_min = p_bowl_min, fx_bowl_max = p_bowl_max,
    fx_captain_mult = p_captain, fx_vice_mult = p_vice, fx_live_update = p_live, updated_at = now() where id = 1;
  insert into public.audit_log (actor_id, area, action) values (auth.uid(), 'settings', 'update_team_rules');
end $$;

do $$
begin
  execute 'revoke all on function public.save_fantasy_team(uuid, text[], text, text) from public, anon';
  execute 'grant execute on function public.save_fantasy_team(uuid, text[], text, text) to authenticated';
  execute 'revoke all on function public.score_fantasy_match(text, boolean) from public, anon, authenticated';
  execute 'grant execute on function public.score_fantasy_match(text, boolean) to service_role';
  execute 'revoke all on function public.refund_match(text, text) from public, anon, authenticated';
  execute 'grant execute on function public.refund_match(text, text) to service_role';
  execute 'revoke all on function public.settle_contest(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.admin_update_team_rules(int, int, int, int, int, int, int, int, int, numeric, numeric, boolean) from public, anon';
  execute 'grant execute on function public.admin_update_team_rules(int, int, int, int, int, int, int, int, int, numeric, numeric, boolean) to authenticated';
end $$;

-- ---------- The 5-minute job (now covers both games) ----------
create or replace function public.process_contests()
returns int language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; n int := 0; players int;
begin
  select * into s from public.app_settings where id = 1;
  -- lock (or cancel under-filled)
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
  -- Predict the XI: no XI after the last automatic try (or 12 h after the lock) → refund
  for c in select ct.id from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.game = 'xi' and ct.status = 'locked' and not public.xi_complete(ct.match_id)
             and ((m.ended and (m.xi_points_checked_at is not null or m.final_points_at is not null)) or ct.lock_at < now() - interval '12 hours') loop
    perform public.refund_contest(c.id, 'CricketData didn’t publish the Playing XI'); n := n + 1;
  end loop;
  -- Fantasy XI: final points never arrived (3 days after the start; 7 for Tests) → refund
  for c in select ct.id from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.game = 'fantasy' and ct.status = 'locked'
             and ct.lock_at < now() - case when m.format = 'Test' then interval '7 days' else interval '3 days' end loop
    perform public.refund_contest(c.id, 'CricketData didn’t publish the final points'); n := n + 1;
  end loop;
  -- pay out 30 minutes after final scoring
  for c in select id from public.contests where status = 'scored' and scored_at < now() - interval '30 minutes' loop
    perform public.settle_contest(c.id); n := n + 1;
  end loop;
  -- keep open games' lock time in step with the match time
  update public.contests ct set lock_at = public.lock_time_for(ct.match_id, ct.game)
  where ct.status = 'open' and ct.lock_at > now() and ct.lock_at is distinct from public.lock_time_for(ct.match_id, ct.game)
    and public.lock_time_for(ct.match_id, ct.game) is not null;
  return n;
end $$;
