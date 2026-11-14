-- =====================================================================
-- Pro11 · Step 4: Game 1, Predict the Playing XI
-- Contests (one per match per game), entries, picks, scoring, payouts.
-- Rules enforced here:
--   • you can only join/pick before the lock, and only with enough balance
--   • other people's picks stay hidden until the lock
--   • fewer than the minimum players at the lock → cancelled and refunded
--   • pot = entry fee × players, no cut; ties split equally (or earliest entry wins)
-- Run once in Supabase → SQL Editor (after steps 1–3).
-- =====================================================================

-- ---------- Audit log: allow the "games" area ----------
alter table public.audit_log drop constraint if exists audit_log_area_check;
alter table public.audit_log add constraint audit_log_area_check
  check (area in ('money', 'matches', 'members', 'settings', 'auto', 'games'));

-- ---------- Game settings ----------
alter table public.app_settings
  add column if not exists xi_points_per_correct int not null default 1  check (xi_points_per_correct between 0 and 100),
  add column if not exists xi_perfect_team_bonus int not null default 5  check (xi_perfect_team_bonus between 0 and 1000),
  add column if not exists xi_both_perfect_bonus int not null default 10 check (xi_both_perfect_bonus between 0 and 1000),
  add column if not exists xi_lock_at            text not null default 'toss' check (xi_lock_at in ('toss', 'start')),
  add column if not exists toss_minutes_before   int not null default 30 check (toss_minutes_before between 0 and 180),
  add column if not exists tie_rule              text not null default 'split' check (tie_rule in ('split', 'earliest')),
  add column if not exists default_fee_xi        int not null default 20 check (default_fee_xi between 0 and 100000),
  add column if not exists default_fee_fantasy   int not null default 50 check (default_fee_fantasy between 0 and 100000),
  add column if not exists min_players           int not null default 2  check (min_players between 2 and 100);

alter table public.matches
  add column if not exists xi_checked_at timestamptz,          -- the one automatic Playing XI check after the toss
  add column if not exists xi_source     text check (xi_source in ('api', 'admin'));

alter table public.match_players
  add column if not exists manual boolean not null default false;  -- added by the admin

-- ---------- Contests ----------
create table if not exists public.contests (
  id             uuid primary key default gen_random_uuid(),
  match_id       text not null references public.matches (id) on delete cascade,
  game           text not null check (game in ('xi', 'fantasy')),
  fee            int  not null check (fee >= 0),
  enabled        boolean not null default true,
  status         text not null default 'open' check (status in ('open', 'locked', 'scored', 'paid', 'cancelled')),
  lock_at        timestamptz not null,
  cancel_reason  text,
  scored_at      timestamptz,
  settled_at     timestamptz,
  settled_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (match_id, game)
);
create index if not exists contests_status_lock on public.contests (status, lock_at);

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  contest_id  uuid not null references public.contests (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  points      numeric not null default 0,
  correct     int not null default 0,
  rank        int,
  payout      int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (contest_id, user_id)
);
create index if not exists entries_user on public.entries (user_id, created_at desc);

create table if not exists public.xi_picks (
  entry_id   uuid not null references public.entries (id) on delete cascade,
  player_id  text not null,
  team       text not null,
  primary key (entry_id, player_id)
);

alter table public.contests enable row level security;
alter table public.entries  enable row level security;
alter table public.xi_picks enable row level security;

drop policy if exists contests_read on public.contests;
create policy contests_read on public.contests for select to authenticated using (true);
drop policy if exists entries_read on public.entries;
create policy entries_read on public.entries for select to authenticated using (true);   -- who joined is public

-- Picks: your own any time; everyone's once the contest has locked (fair for the admin too).
create or replace function public.can_see_picks(p_entry uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entries e join public.contests c on c.id = e.contest_id
    where e.id = p_entry and (e.user_id = auth.uid() or c.status <> 'open')
  );
$$;
drop policy if exists xi_picks_read on public.xi_picks;
create policy xi_picks_read on public.xi_picks for select to authenticated using (public.can_see_picks(entry_id));

revoke insert, update, delete on public.contests, public.entries, public.xi_picks from anon, authenticated;

-- ---------- Helpers ----------
create or replace function public.lock_time_for(p_match text, p_game text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case
    when p_game = 'xi' and s.xi_lock_at = 'toss' then m.starts_at - make_interval(mins => s.toss_minutes_before)
    else m.starts_at end
  from public.matches m cross join public.app_settings s where m.id = p_match and s.id = 1;
$$;

/** The match's contest for a game, created with today's defaults the first time anyone looks. */
create or replace function public.ensure_contest(p_match text, p_game text)
returns public.contests language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; m public.matches;
begin
  if auth.uid() is null then raise exception 'Sign in again'; end if;
  if p_game not in ('xi', 'fantasy') then raise exception 'Unknown game'; end if;
  select * into c from public.contests where match_id = p_match and game = p_game;
  if found then return c; end if;
  select * into m from public.matches where id = p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  select * into s from public.app_settings where id = 1;
  insert into public.contests (match_id, game, fee, lock_at)
  values (p_match, p_game, case p_game when 'xi' then s.default_fee_xi else s.default_fee_fantasy end, public.lock_time_for(p_match, p_game))
  on conflict (match_id, game) do nothing;
  select * into c from public.contests where match_id = p_match and game = p_game;
  return c;
end $$;

create or replace function public.contest_label(p_contest uuid)
returns text language sql stable security definer set search_path = public as $$
  select (case c.game when 'xi' then 'Predict the XI' else 'Fantasy XI' end) || ', ' ||
         coalesce(m.team_a_short, m.team_a) || ' vs ' || coalesce(m.team_b_short, m.team_b)
  from public.contests c join public.matches m on m.id = c.match_id where c.id = p_contest;
$$;

-- ---------- Member actions ----------
create or replace function public.join_contest(p_match text, p_game text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; bal int; v_entry uuid;
begin
  me := public.require_member();
  if not me.can_play then raise exception 'You can’t join games right now. Ask the admin.'; end if;
  c := public.ensure_contest(p_match, p_game);
  if not c.enabled then raise exception 'This game isn’t running for this match'; end if;
  if c.status <> 'open' or now() >= c.lock_at then raise exception 'This game has locked'; end if;
  if exists (select 1 from public.entries where contest_id = c.id and user_id = me.id) then raise exception 'You’ve already joined'; end if;
  perform 1 from public.profiles where id = me.id for update;           -- one money action at a time
  bal := public.wallet_balance(me.id);
  if bal < c.fee then raise exception 'You need ₹% more to join. Add money first.', c.fee - bal; end if;
  insert into public.entries (contest_id, user_id) values (c.id, me.id) returning id into v_entry;
  if c.fee > 0 then
    insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
    values (me.id, -c.fee, 'entry', v_entry, public.contest_label(c.id), me.id);
  end if;
  return v_entry;
end $$;

create or replace function public.leave_contest(p_contest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; e public.entries;
begin
  me := public.require_member();
  perform 1 from public.profiles where id = me.id for update;
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status <> 'open' or now() >= c.lock_at then raise exception 'You can’t leave after the lock'; end if;
  select * into e from public.entries where contest_id = c.id and user_id = me.id;
  if e.id is null then raise exception 'You haven’t joined this game'; end if;
  delete from public.entries where id = e.id;
  if c.fee > 0 then
    insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
    values (me.id, c.fee, 'refund', e.id, 'Left ' || public.contest_label(c.id), me.id);
  end if;
end $$;

create or replace function public.save_xi_picks(p_contest uuid, p_players text[])
returns int language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; e public.entries; n int; bad int; per_team int;
begin
  me := public.require_member();
  select * into c from public.contests where id = p_contest;
  if c.id is null or c.game <> 'xi' then raise exception 'Game not found'; end if;
  if c.status <> 'open' or now() >= c.lock_at then raise exception 'Picks are locked'; end if;
  select * into e from public.entries where contest_id = c.id and user_id = me.id;
  if e.id is null then raise exception 'Join the game first'; end if;
  p_players := coalesce(p_players, '{}');
  select count(*) into bad from unnest(p_players) x(pid)
    where not exists (select 1 from public.match_players mp where mp.match_id = c.match_id and mp.player_id = x.pid);
  if bad > 0 then raise exception 'Some players aren’t in this match’s squads. Reload and try again.'; end if;
  select coalesce(max(cnt), 0) into per_team from (
    select mp.team, count(*) cnt from public.match_players mp
    where mp.match_id = c.match_id and mp.player_id = any (p_players) group by mp.team) t;
  if per_team > 11 then raise exception 'Pick at most 11 from each team'; end if;
  delete from public.xi_picks where entry_id = e.id;
  insert into public.xi_picks (entry_id, player_id, team)
  select e.id, mp.player_id, mp.team from public.match_players mp
  where mp.match_id = c.match_id and mp.player_id = any (p_players);
  get diagnostics n = row_count;
  update public.entries set updated_at = now() where id = e.id;
  return n;
end $$;

-- ---------- Locking and cancelling (runs every 5 minutes, no API calls) ----------
create or replace function public.refund_contest(p_contest uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; e record; n int := 0;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status in ('cancelled', 'paid') then return 0; end if;
  for e in select * from public.entries where contest_id = c.id loop
    if c.fee > 0 then
      insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
      values (e.user_id, c.fee, 'refund', e.id, public.contest_label(c.id) || ': ' || p_reason, auth.uid());
    end if;
    perform public.notify(e.user_id, 'contest_cancelled', public.contest_label(c.id) || ' was cancelled',
      format('%s. Your ₹%s entry is back in your wallet.', p_reason, c.fee), '/match/' || c.match_id);
    n := n + 1;
  end loop;
  update public.contests set status = 'cancelled', cancel_reason = p_reason, settled_at = now(), settled_by = auth.uid() where id = c.id;
  return n;
end $$;

create or replace function public.process_contests()
returns int language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; n int := 0; players int;
begin
  select * into s from public.app_settings where id = 1;
  for c in select * from public.contests where status = 'open' and lock_at <= now() for update skip locked loop
    select count(*) into players from public.entries where contest_id = c.id;
    if players = 0 then
      update public.contests set status = 'cancelled', cancel_reason = 'Nobody joined', settled_at = now() where id = c.id;
    elsif players < s.min_players then
      perform public.refund_contest(c.id, format('Fewer than %s players joined', s.min_players));
    else
      update public.contests set status = 'locked' where id = c.id;
      perform public.notify_admins('xi_needed', 'Confirm the Playing XI: ' || public.contest_label(c.id),
        'Picks are locked. If the XI doesn’t arrive from the data service, tick it yourself.', '/admin/match/' || c.match_id);
    end if;
    n := n + 1;
  end loop;
  -- keep lock times in step with match times and settings while still open
  update public.contests ct set lock_at = public.lock_time_for(ct.match_id, ct.game)
  where ct.status = 'open' and ct.lock_at > now() and ct.lock_at is distinct from public.lock_time_for(ct.match_id, ct.game)
    and public.lock_time_for(ct.match_id, ct.game) is not null;
  return n;
end $$;

-- ---------- Scoring ----------
create or replace function public.xi_complete(p_match text)
returns boolean language sql stable security definer set search_path = public as $$
  select count(distinct team) = 2 and bool_and(n = 11) from (
    select team, count(*) filter (where in_xi) n from public.match_players where match_id = p_match group by team
  ) t where exists (select 1 from public.match_players where match_id = p_match);
$$;

create or replace function public.score_xi_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; n int;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.game <> 'xi' then raise exception 'Game not found'; end if;
  if c.status not in ('locked', 'scored') then raise exception 'Only a locked game can be scored'; end if;
  if not public.xi_complete(c.match_id) then raise exception 'Confirm 11 players for each team first'; end if;
  select * into s from public.app_settings where id = 1;
  with per_team as (
    select e.id entry_id, mp.team, count(*) filter (where mp.in_xi) good
    from public.entries e
    join public.xi_picks p on p.entry_id = e.id
    join public.match_players mp on mp.match_id = c.match_id and mp.player_id = p.player_id
    where e.contest_id = c.id group by e.id, mp.team
  ), totals as (
    select e.id entry_id,
           coalesce(sum(pt.good), 0)::int correct,
           count(*) filter (where pt.good = 11)::int perfect
    from public.entries e left join per_team pt on pt.entry_id = e.id
    where e.contest_id = c.id group by e.id
  )
  update public.entries e set
    correct = t.correct,
    points = t.correct * s.xi_points_per_correct + t.perfect * s.xi_perfect_team_bonus
             + case when t.perfect = 2 then s.xi_both_perfect_bonus else 0 end,
    updated_at = now()
  from totals t where e.id = t.entry_id;
  update public.entries e set rank = r.rk
  from (select id, rank() over (order by points desc) rk from public.entries where contest_id = c.id) r
  where e.id = r.id;
  get diagnostics n = row_count;
  if c.status = 'locked' then
    perform public.notify(e.user_id, 'contest_scored', public.contest_label(c.id) || ': scores are in',
      'See how your picks compare with the real XI.', '/match/' || c.match_id || '/xi/results')
    from public.entries e where e.contest_id = c.id;
  end if;
  update public.contests set status = 'scored', scored_at = now() where id = c.id;
  return n;
end $$;

create or replace function public.score_match_xi(p_match text)
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  if not public.xi_complete(p_match) then return 0; end if;
  for c in select id from public.contests where match_id = p_match and game = 'xi' and status in ('locked', 'scored') loop
    perform public.score_xi_contest(c.id); n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Admin: Playing XI, squads, games ----------
create or replace function public.admin_set_xi(p_match text, p_team text, p_players text[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Only the admin can set the XI'; end if;
  if exists (select 1 from public.contests where match_id = p_match and game = 'xi' and status = 'paid') then
    raise exception 'This game is already paid out'; end if;
  if coalesce(array_length(p_players, 1), 0) > 11 then raise exception 'Pick at most 11'; end if;
  update public.match_players set in_xi = (player_id = any (coalesce(p_players, '{}'))), updated_at = now()
  where match_id = p_match and team = p_team;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No squad for that team'; end if;
  update public.matches set xi_source = 'admin' where id = p_match;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', 'set_xi', jsonb_build_object('match', p_match, 'team', p_team, 'players', coalesce(array_length(p_players, 1), 0)));
  perform public.score_match_xi(p_match);     -- rescores automatically once both teams have 11
  return coalesce(array_length(p_players, 1), 0);
end $$;

create or replace function public.admin_add_player(p_match text, p_team text, p_name text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_admin() then raise exception 'Only the admin can edit squads'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter a name'; end if;
  if p_role not in ('WK', 'BAT', 'AR', 'BOWL') then raise exception 'Pick a role'; end if;
  if not exists (select 1 from public.matches where id = p_match and p_team in (team_a, team_b)) then raise exception 'Team not in this match'; end if;
  v_id := 'manual-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.match_players (match_id, player_id, name, team, role, manual) values (p_match, v_id, trim(p_name), p_team, p_role, true);
  insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'games', 'add_player', jsonb_build_object('match', p_match, 'name', p_name));
  return v_id;
end $$;

create or replace function public.admin_update_contest(p_match text, p_game text, p_fee int, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contests; players int;
begin
  if not public.is_admin() then raise exception 'Only the admin can change games'; end if;
  c := public.ensure_contest(p_match, p_game);
  if c.status <> 'open' then raise exception 'This game has already locked'; end if;
  select count(*) into players from public.entries where contest_id = c.id;
  if players > 0 and p_fee <> c.fee then raise exception 'People have joined, so the fee can’t change. Cancel and refund instead.'; end if;
  if players > 0 and not p_enabled then raise exception 'People have joined. Use Cancel and refund instead.'; end if;
  if p_fee < 0 then raise exception 'Fee can’t be negative'; end if;
  update public.contests set fee = p_fee, enabled = p_enabled where id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', 'update_contest', jsonb_build_object('match', p_match, 'game', p_game, 'fee', p_fee, 'enabled', p_enabled));
end $$;

create or replace function public.admin_cancel_contest(p_contest uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Only the admin can cancel games'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason'; end if;
  if exists (select 1 from public.contests where id = p_contest and status = 'paid') then
    raise exception 'Already paid out. Adjust wallets by hand if you need to undo it.'; end if;
  n := public.refund_contest(p_contest, trim(p_reason));
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', 'cancel_contest', jsonb_build_object('contest', p_contest, 'reason', p_reason, 'refunded', n));
  return n;
end $$;

/** Pays the pot to the winner(s). Split: equal shares, any leftover rupee to the earliest winner. */
create or replace function public.admin_settle_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; pot int; top numeric; winners int; v_share int; v_extra int; v_amt int; w record; i int := 0;
begin
  if not public.is_admin() then raise exception 'Only the admin can pay out'; end if;
  select * into c from public.contests where id = p_contest for update;
  if c.id is null then raise exception 'Game not found'; end if;
  if c.status <> 'scored' then raise exception 'Score the game before paying out'; end if;
  select * into s from public.app_settings where id = 1;
  select c.fee * count(*), max(points) into pot, top from public.entries where contest_id = c.id;
  if s.tie_rule = 'earliest' then winners := 1; else select count(*) into winners from public.entries where contest_id = c.id and points = top; end if;
  v_share := pot / winners; v_extra := pot - v_share * winners;
  for w in select * from public.entries where contest_id = c.id and points = top order by created_at limit winners loop
    i := i + 1;
    v_amt := v_share + (case when i = 1 then v_extra else 0 end);   -- any leftover rupee goes to the earliest winner
    update public.entries set payout = v_amt where id = w.id;
    if v_amt > 0 then
      insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
      values (w.user_id, v_amt, 'payout', w.id, 'Won ' || public.contest_label(c.id), auth.uid());
    end if;
  end loop;
  update public.contests set status = 'paid', settled_at = now(), settled_by = auth.uid() where id = c.id;
  perform public.notify(e.user_id, 'contest_paid', public.contest_label(c.id) || ': final results',
    case when e.payout > 0 then format('You won ₹%s!', e.payout) else 'See the final standings.' end, '/match/' || c.match_id || '/xi/results')
  from public.entries e where e.contest_id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', 'settle_contest', jsonb_build_object('contest', c.id, 'pot', pot, 'winners', winners));
  return winners;
end $$;

create or replace function public.admin_update_game_settings(
  p_points_per_correct int, p_perfect_bonus int, p_both_bonus int, p_lock_at text, p_toss_minutes int,
  p_tie_rule text, p_fee_xi int, p_fee_fantasy int, p_min_players int
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can change rules'; end if;
  update public.app_settings set
    xi_points_per_correct = p_points_per_correct, xi_perfect_team_bonus = p_perfect_bonus, xi_both_perfect_bonus = p_both_bonus,
    xi_lock_at = p_lock_at, toss_minutes_before = p_toss_minutes, tie_rule = p_tie_rule,
    default_fee_xi = p_fee_xi, default_fee_fantasy = p_fee_fantasy, min_players = p_min_players, updated_at = now()
  where id = 1;
  insert into public.audit_log (actor_id, area, action) values (auth.uid(), 'settings', 'update_games');
  perform public.process_contests();    -- re-time open games
end $$;

-- ---------- Permissions ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.lock_time_for(text, text)', 'public.contest_label(uuid)', 'public.refund_contest(uuid, text)',
    'public.process_contests()', 'public.score_xi_contest(uuid)', 'public.score_match_xi(text)', 'public.xi_complete(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.ensure_contest(text, text)', 'public.join_contest(text, text)', 'public.leave_contest(uuid)',
    'public.save_xi_picks(uuid, text[])', 'public.can_see_picks(uuid)',
    'public.admin_set_xi(text, text, text[])', 'public.admin_add_player(text, text, text, text)',
    'public.admin_update_contest(text, text, int, boolean)', 'public.admin_cancel_contest(uuid, text)',
    'public.admin_settle_contest(uuid)',
    'public.admin_update_game_settings(int, int, int, text, int, text, int, int, int)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.score_match_xi(text), public.xi_complete(text) to service_role;

-- ---------- Every 5 minutes: lock games, cancel under-filled ones (pure SQL, costs nothing) ----------
select cron.unschedule('pro11-process-contests') where exists (select 1 from cron.job where jobname = 'pro11-process-contests');
select cron.schedule('pro11-process-contests', '*/5 * * * *', $job$ select public.process_contests(); $job$);

-- ---------- Sync job: every 15 minutes (it only calls the API when something is due) ----------
select cron.unschedule('pro11-cricket-tick') where exists (select 1 from cron.job where jobname = 'pro11-cricket-tick');
select cron.schedule(
  'pro11-cricket-tick',
  '*/15 * * * *',
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
