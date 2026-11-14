-- =====================================================================
-- Pro11 · Step 7: everything else from the approved screens
--   General, notification, bonus and appearance settings · per-format game defaults · max players ·
--   top-2 payout · lock reminders · "Playing XI is out" · broadcast · Add member (invites) ·
--   sign a member out · bonus points on Ranks · phone push alerts · team badges · optional scorecard
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- ---------- Settings ----------
alter table public.app_settings
  add column if not exists days_ahead     int  not null default 2 check (days_ahead between 2 and 3),
  add column if not exists home_tab       text not null default 'Today' check (home_tab in ('Today', 'Mine')),
  add column if not exists card_style     text not null default 'notched' check (card_style in ('notched', 'plain')),
  add column if not exists n_xi_out       boolean not null default true,
  add column if not exists n_lock_soon    boolean not null default true,
  add column if not exists n_lock_minutes int not null default 15 check (n_lock_minutes between 5 and 120),
  add column if not exists n_money        boolean not null default true,
  add column if not exists n_results      boolean not null default true,
  add column if not exists n_withdrawal   boolean not null default true,
  add column if not exists bonus_join     int not null default 5  check (bonus_join between 0 and 1000),
  add column if not exists bonus_win      int not null default 50 check (bonus_win between 0 and 1000),
  add column if not exists bonus_second   int not null default 20 check (bonus_second between 0 and 1000),
  add column if not exists bonus_perfect  int not null default 25 check (bonus_perfect between 0 and 1000),
  add column if not exists bonus_reset    text not null default 'month' check (bonus_reset in ('month', 'year', 'never')),
  add column if not exists show_bonus     boolean not null default true,
  add column if not exists payout_mode    text not null default 'winner' check (payout_mode in ('winner', 'top2')),
  add column if not exists max_players    int not null default 10 check (max_players between 2 and 100),
  add column if not exists open_xi        boolean not null default true,
  add column if not exists open_fantasy   boolean not null default true,
  add column if not exists fx_ruleset     int not null default 0 check (fx_ruleset >= 0),
  add column if not exists full_scorecard boolean not null default false,
  add column if not exists fees           jsonb;
update public.app_settings set fees = jsonb_build_object(
  'T20',   jsonb_build_object('xi', default_fee_xi, 'fantasy', default_fee_fantasy),
  'ODI',   jsonb_build_object('xi', default_fee_xi, 'fantasy', default_fee_fantasy),
  'Test',  jsonb_build_object('xi', default_fee_xi, 'fantasy', default_fee_fantasy),
  'Other', jsonb_build_object('xi', default_fee_xi, 'fantasy', default_fee_fantasy))
where id = 1 and fees is null;

alter table public.contests add column if not exists reminded_at timestamptz;
alter table public.contests add column if not exists max_players int;
alter table public.entries  add column if not exists perfect_sides int not null default 0;
alter table public.profiles add column if not exists signout_at timestamptz;
alter table public.matches  add column if not exists xi_notified_at timestamptz;
alter table public.matches  add column if not exists scorecard jsonb;
alter table public.matches  add column if not exists scorecard_at timestamptz;

-- ---------- Notifications respect the admin's choices ----------
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.app_settings; ok boolean;
begin
  select * into s from public.app_settings where id = 1;
  ok := case
    when p_kind in ('payment_approved', 'payment_rejected', 'wallet_adjusted') then s.n_money
    when p_kind in ('withdrawal_paid', 'withdrawal_rejected') then s.n_withdrawal
    when p_kind in ('contest_scored', 'contest_paid', 'contest_cancelled') then s.n_results
    when p_kind = 'xi_out' then s.n_xi_out
    when p_kind = 'lock_soon' then s.n_lock_soon
    else true end;
  if ok then
    insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link);
  end if;
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- Games: per-format defaults, open toggles, max players ----------
create or replace function public.ensure_contest(p_match text, p_game text)
returns public.contests language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; m public.matches; fmt text;
begin
  if auth.uid() is null then raise exception 'Sign in again'; end if;
  if p_game not in ('xi', 'fantasy') then raise exception 'Unknown game'; end if;
  select * into c from public.contests where match_id = p_match and game = p_game;
  if found then return c; end if;
  select * into m from public.matches where id = p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  select * into s from public.app_settings where id = 1;
  fmt := case when m.format in ('T20', 'ODI', 'Test') then m.format else 'Other' end;
  insert into public.contests (match_id, game, fee, enabled, lock_at, max_players)
  values (p_match, p_game,
          coalesce((s.fees -> fmt ->> p_game)::int, case p_game when 'xi' then s.default_fee_xi else s.default_fee_fantasy end),
          case p_game when 'xi' then s.open_xi else s.open_fantasy end,
          public.lock_time_for(p_match, p_game), s.max_players)
  on conflict (match_id, game) do nothing;
  select * into c from public.contests where match_id = p_match and game = p_game;
  return c;
end $$;

create or replace function public.join_contest(p_match text, p_game text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; s public.app_settings; bal int; v_entry uuid; players int;
begin
  me := public.require_member();
  if not me.can_play then raise exception 'You can’t join games right now. Ask the admin.'; end if;
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

create or replace function public.admin_set_game(p_match text, p_game text, p_fee int, p_enabled boolean, p_max_players int)
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
  if p_max_players < greatest(2, players) then raise exception 'Most players can’t be below % (already joined)', greatest(2, players); end if;
  update public.contests set fee = p_fee, enabled = p_enabled, max_players = p_max_players where id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', 'update_contest', jsonb_build_object('match', p_match, 'game', p_game, 'fee', p_fee, 'enabled', p_enabled, 'max', p_max_players));
end $$;

-- ---------- Predict the XI scoring: also counts perfect sides (for bonus points) ----------
create or replace function public.score_xi_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; n int;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.game <> 'xi' then raise exception 'Game not found'; end if;
  if c.status not in ('locked', 'scored') then raise exception 'Only a locked game can be scored'; end if;
  if not public.xi_complete(c.match_id) then raise exception 'The Playing XI isn’t complete'; end if;
  select * into s from public.app_settings where id = 1;
  with per_team as (
    select e.id entry_id, mp.team, count(*) filter (where mp.in_xi) good
    from public.entries e
    join public.xi_picks p on p.entry_id = e.id
    join public.match_players mp on mp.match_id = c.match_id and mp.player_id = p.player_id
    where e.contest_id = c.id group by e.id, mp.team
  ), totals as (
    select e.id entry_id, coalesce(sum(pt.good), 0)::int correct, count(*) filter (where pt.good = 11)::int perfect
    from public.entries e left join per_team pt on pt.entry_id = e.id
    where e.contest_id = c.id group by e.id
  )
  update public.entries e set
    correct = t.correct, perfect_sides = t.perfect,
    points = t.correct * s.xi_points_per_correct + t.perfect * s.xi_perfect_team_bonus
             + case when t.perfect = 2 then s.xi_both_perfect_bonus else 0 end,
    updated_at = now()
  from totals t where e.id = t.entry_id;
  update public.entries e set rank = r.rk
  from (select id, rank() over (order by points desc) rk from public.entries where contest_id = c.id) r where e.id = r.id;
  get diagnostics n = row_count;
  if c.status = 'locked' then
    perform public.notify(e.user_id, 'contest_scored', public.contest_label(c.id) || ': scores are in',
      'Pays out in 30 minutes.', '/match/' || c.match_id || '/xi/results')
    from public.entries e where e.contest_id = c.id;
  end if;
  update public.contests set status = 'scored', scored_at = now() where id = c.id;
  return n;
end $$;

-- When the Playing XI is first complete: score Predict the XI and tell everyone in this match's games
create or replace function public.score_match_xi(p_match text)
returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; m public.matches; fx public.contests;
begin
  if not public.xi_complete(p_match) then return 0; end if;
  for c in select id from public.contests where match_id = p_match and game = 'xi' and status in ('locked', 'scored') loop
    perform public.score_xi_contest(c.id); n := n + 1;
  end loop;
  update public.matches set xi_notified_at = now() where id = p_match and xi_notified_at is null returning * into m;
  if m.id is not null then
    select * into fx from public.contests where match_id = p_match and game = 'fantasy';
    perform public.notify(u.user_id, 'xi_out',
      format('Playing XI is out for %s vs %s', coalesce(m.team_a_short, m.team_a), coalesce(m.team_b_short, m.team_b)),
      case when fx.id is not null and fx.status = 'open' then format('Check your Fantasy XI before %s.', to_char(fx.lock_at at time zone 'Asia/Kolkata', 'HH24:MI')) else 'See how your picks did.' end,
      '/match/' || p_match)
    from (select distinct e.user_id from public.entries e join public.contests ct on ct.id = e.contest_id where ct.match_id = p_match) u;
  end if;
  return n;
end $$;

-- ---------- Payout: winner takes all, or top 2 split 70/30 ----------
create or replace function public.settle_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; pot int; players int; top numeric; second numeric; n1 int; n2 int;
        first_pot int; second_pot int; w record; i int; v_amt int; paid int := 0;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status <> 'scored' then return 0; end if;
  select * into s from public.app_settings where id = 1;
  select count(*), c.fee * count(*), max(points) into players, pot, top from public.entries where contest_id = c.id;
  select count(*) into n1 from public.entries where contest_id = c.id and points = top;
  select max(points) into second from public.entries where contest_id = c.id and points < top;
  select count(*) into n2 from public.entries where contest_id = c.id and points = second;
  -- Top 2 split only with 3+ players and a clear winner; otherwise the top group shares the whole pot
  if s.payout_mode = 'top2' and players >= 3 and n1 = 1 and second is not null then
    first_pot := floor(pot * 0.7); second_pot := pot - first_pot;
  else
    first_pot := pot; second_pot := 0;
  end if;
  -- first place (split equally, or earliest entry only); any leftover rupee goes to the earliest
  if s.tie_rule = 'earliest' then n1 := 1; end if;
  i := 0;
  for w in select * from public.entries where contest_id = c.id and points = top order by created_at limit n1 loop
    i := i + 1; v_amt := first_pot / n1 + (case when i = 1 then first_pot - (first_pot / n1) * n1 else 0 end);
    update public.entries set payout = v_amt where id = w.id;
    if v_amt > 0 then
      insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by) values (w.user_id, v_amt, 'payout', w.id, 'Won ' || public.contest_label(c.id), auth.uid());
    end if;
    paid := paid + 1;
  end loop;
  if second_pot > 0 then
    if s.tie_rule = 'earliest' then n2 := 1; end if;
    i := 0;
    for w in select * from public.entries where contest_id = c.id and points = second order by created_at limit n2 loop
      i := i + 1; v_amt := second_pot / n2 + (case when i = 1 then second_pot - (second_pot / n2) * n2 else 0 end);
      update public.entries set payout = v_amt where id = w.id;
      if v_amt > 0 then
        insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by) values (w.user_id, v_amt, 'payout', w.id, '2nd in ' || public.contest_label(c.id), auth.uid());
      end if;
      paid := paid + 1;
    end loop;
  end if;
  update public.contests set status = 'paid', settled_at = now(), settled_by = auth.uid() where id = c.id;
  perform public.notify(e.user_id, 'contest_paid', public.contest_label(c.id) || ': final results',
    case when e.payout > 0 then format('You won ₹%s!', e.payout) else 'See the final standings.' end,
    '/match/' || c.match_id || case c.game when 'xi' then '/xi/results' else '/fantasy/results' end)
  from public.entries e where e.contest_id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', case when auth.uid() is null then 'auto_settle' else 'settle_contest' end,
          jsonb_build_object('contest', c.id, 'pot', pot, 'winners', paid, 'mode', s.payout_mode));
  return paid;
end $$;
revoke all on function public.settle_contest(uuid) from public, anon, authenticated;

-- ---------- The 5-minute job: + "locks soon" reminders ----------
create or replace function public.process_contests()
returns int language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; n int := 0; players int;
begin
  select * into s from public.app_settings where id = 1;
  -- reminders before the lock (once per game, to the people in it)
  for c in select ct.*, m.team_a, m.team_b, m.team_a_short, m.team_b_short from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.status = 'open' and ct.reminded_at is null and ct.lock_at > now() and ct.lock_at <= now() + make_interval(mins => s.n_lock_minutes) loop
    update public.contests set reminded_at = now() where id = c.id;
    perform public.notify(e.user_id, 'lock_soon',
      format('%s locks at %s', case c.game when 'xi' then 'Predict the XI' else 'Fantasy XI' end, to_char(c.lock_at at time zone 'Asia/Kolkata', 'HH24:MI')),
      format('%s vs %s. Last chance to change your %s.', coalesce(c.team_a_short, c.team_a), coalesce(c.team_b_short, c.team_b), case c.game when 'xi' then 'picks' else 'team' end),
      '/match/' || c.match_id || case c.game when 'xi' then '/xi' else '/fantasy' end)
    from public.entries e where e.contest_id = c.id;
  end loop;
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
  update public.contests ct set lock_at = public.lock_time_for(ct.match_id, ct.game)
  where ct.status = 'open' and ct.lock_at > now() and ct.lock_at is distinct from public.lock_time_for(ct.match_id, ct.game)
    and public.lock_time_for(ct.match_id, ct.game) is not null;
  return n;
end $$;

-- ---------- Ranks with bonus points (leaderboard only, never money) ----------
drop function if exists public.leaderboard(timestamptz, text);
create or replace function public.leaderboard(p_since timestamptz default null, p_game text default null)
returns table (user_id uuid, name text, color text, played int, won int, winnings int, spent int, net int, bonus int)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.app_settings where id = 1),
  done as (
    select e.*, c.fee from public.entries e join public.contests c on c.id = e.contest_id
    where c.status = 'paid' and (p_game is null or c.game = p_game) and (p_since is null or c.settled_at >= p_since)
  )
  select p.id, p.name, p.color,
         count(d.id)::int,
         count(d.id) filter (where d.payout > 0)::int,
         coalesce(sum(d.payout), 0)::int,
         coalesce(sum(d.fee), 0)::int,
         (coalesce(sum(d.payout), 0) - coalesce(sum(d.fee), 0))::int,
         coalesce(sum((select s.bonus_join from s)
                      + case when d.rank = 1 then (select s.bonus_win from s) when d.rank = 2 then (select s.bonus_second from s) else 0 end
                      + d.perfect_sides * (select s.bonus_perfect from s)), 0)::int
  from public.profiles p left join done d on d.user_id = p.id
  where not p.blocked and auth.uid() is not null
  group by p.id, p.name, p.color
  order by 8 desc, 5 desc, 4 desc, 2;
$$;
revoke all on function public.leaderboard(timestamptz, text) from public, anon;
grant execute on function public.leaderboard(timestamptz, text) to authenticated;

-- ---------- Message everyone ----------
create or replace function public.admin_broadcast(p_title text, p_body text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Only the admin can message everyone'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Write a message'; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select id, 'broadcast', left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 400), ''), '/' from public.profiles where not blocked;
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'members', 'broadcast', jsonb_build_object('to', n, 'title', p_title));
  return n;
end $$;

-- ---------- Add member (invite) ----------
create table if not exists public.invites (
  phone            text primary key check (phone ~ '^\+91[6-9][0-9]{9}$'),
  name             text not null,
  role             text not null default 'member' check (role in ('member', 'admin')),
  starting_balance int  not null default 0 check (starting_balance between 0 and 100000),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  used_at          timestamptz
);
alter table public.invites enable row level security;
drop policy if exists invites_admin_read on public.invites;
create policy invites_admin_read on public.invites for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.invites from anon, authenticated;

create or replace function public.admin_add_member(p_name text, p_phone text, p_role text, p_balance int)
returns void language plpgsql security definer set search_path = public as $$
declare ph text := '+91' || right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if not public.is_admin() then raise exception 'Only the admin can add members'; end if;
  if ph !~ '^\+91[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit Indian mobile number'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter a name'; end if;
  if exists (select 1 from public.profiles where phone = ph) then raise exception 'That number is already a member'; end if;
  insert into public.invites (phone, name, role, starting_balance, created_by)
  values (ph, trim(p_name), coalesce(p_role, 'member'), greatest(0, coalesce(p_balance, 0)), auth.uid())
  on conflict (phone) do update set name = excluded.name, role = excluded.role, starting_balance = excluded.starting_balance, used_at = null;
  insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'members', 'add_member', jsonb_build_object('member', trim(p_name), 'role', p_role, 'amount', p_balance));
end $$;

create or replace function public.admin_cancel_invite(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  delete from public.invites where phone = p_phone and used_at is null;
end $$;

/** Called by the sign-in function when an invited number signs in for the first time. */
create or replace function public.consume_invite(p_user uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invites;
begin
  select * into i from public.invites where phone = p_phone and used_at is null for update;
  if i.phone is null then return; end if;
  update public.invites set used_at = now() where phone = p_phone;
  if i.role = 'admin' then update public.profiles set role = 'admin' where id = p_user; end if;
  if i.starting_balance > 0 then
    insert into public.wallet_txns (user_id, amount, kind, note, created_by) values (p_user, i.starting_balance, 'adjustment', 'Starting balance', i.created_by);
  end if;
end $$;

-- ---------- Sign one member out everywhere ----------
create or replace function public.admin_signout_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  update public.profiles set signout_at = now() where id = p_user;
  insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'members', 'signout_member', jsonb_build_object('member', (select name from public.profiles where id = p_user)));
end $$;

-- ---------- Team badges (admin uploads) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-badges', 'team-badges', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;
drop policy if exists "pro11 badges admin write" on storage.objects;
create policy "pro11 badges admin write" on storage.objects for insert to authenticated with check (bucket_id = 'team-badges' and public.is_admin());
drop policy if exists "pro11 badges admin update" on storage.objects;
create policy "pro11 badges admin update" on storage.objects for update to authenticated using (bucket_id = 'team-badges' and public.is_admin());
drop policy if exists "pro11 badges read" on storage.objects;
create policy "pro11 badges read" on storage.objects for select using (bucket_id = 'team-badges');

create or replace function public.admin_set_team_badge(p_key text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can change badges'; end if;
  update public.teams set custom_img = nullif(p_url, ''), updated_at = now() where key = lower(p_key);
  if not found then raise exception 'Team not found'; end if;
end $$;

-- ---------- Phone push alerts: every new notification is pushed to that person's devices ----------
create table if not exists public.push_config (id int primary key default 1 check (id = 1), public_key text not null, private_key text not null);
alter table public.push_config enable row level security;      -- no policies: only the push function reads it
revoke all on public.push_config from anon, authenticated;

create or replace function public.push_new_notification()
returns trigger language plpgsql security definer set search_path = public, private, extensions as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url     := 'https://mdtqgovuodwspxztsvps.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-token', (select token from private.sync_config where id = 1)),
      body    := jsonb_build_object('id', new.id),
      timeout_milliseconds := 10000);
  end if;
  return new;
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications for each row execute function public.push_new_notification();

-- ---------- Permissions ----------
do $$
declare f text;
begin
  foreach f in array array['public.consume_invite(uuid, text)', 'public.push_new_notification()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  execute 'grant execute on function public.consume_invite(uuid, text) to service_role';
  foreach f in array array[
    'public.admin_set_game(text, text, int, boolean, int)', 'public.admin_broadcast(text, text)',
    'public.admin_add_member(text, text, text, int)', 'public.admin_cancel_invite(text)',
    'public.admin_signout_member(uuid)', 'public.admin_set_team_badge(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
