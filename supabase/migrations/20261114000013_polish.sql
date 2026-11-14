-- =====================================================================
-- Pro11 · Fixes and improvements from the audit
--   • Syncing back on · admin can change a member's phone · fantasy points breakdown (bat / bowl / field)
--   • "Squads are out" alerts · live scores for joined matches (settings) · admin alerts
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- You asked to turn syncing back on.
update public.app_settings set sync_paused = false where id = 1;

alter table public.app_settings
  add column if not exists n_squads_out          boolean not null default true,
  add column if not exists last_squads_notice_at timestamptz,
  add column if not exists live_scores           boolean not null default true,
  add column if not exists live_score_minutes    int not null default 30 check (live_score_minutes between 15 and 180);

-- Fantasy points per player, split by what earned them (same paid call as before, no extra credits)
alter table public.player_points
  add column if not exists bat   numeric not null default 0,
  add column if not exists bowl  numeric not null default 0,
  add column if not exists field numeric not null default 0;

-- ---------- Notifications: "squads out" respects its switch; admin alerts always reach the admin ----------
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
    when p_kind = 'squads_out' then s.n_squads_out
    else true end;
  if ok then
    insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link);
  end if;
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- Admin alerts, with a cool-down so the same problem doesn't ping every 15 minutes ----------
create table if not exists public.admin_alerts (kind text primary key, last_at timestamptz not null default now());
alter table public.admin_alerts enable row level security;
revoke all on public.admin_alerts from anon, authenticated;

create or replace function public.admin_alert(p_kind text, p_title text, p_body text, p_link text, p_cooldown_minutes int default 360)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admin_alerts where kind = p_kind and last_at > now() - make_interval(mins => p_cooldown_minutes)) then return false; end if;
  insert into public.admin_alerts (kind, last_at) values (p_kind, now()) on conflict (kind) do update set last_at = now();
  perform public.notify_admins('admin_alert', p_title, p_body, p_link);
  return true;
end $$;
revoke all on function public.admin_alert(text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.admin_alert(text, text, text, text, int) to service_role;

-- ---------- "Squads are out": one alert per refresh listing newly opened matches ----------
create or replace function public.notify_squads_out()
returns int language plpgsql security definer set search_path = public as $$
declare s public.app_settings; n int; names text;
begin
  select * into s from public.app_settings where id = 1;
  with fresh as (
    select m.* from public.matches m
    where m.squad_seen_at is not null and m.squad_seen_at > coalesce(s.last_squads_notice_at, now() - interval '1 day')
      and not m.started and not m.ended and m.starts_at > now() and m.fantasy_ok and m.visibility <> 'hidden'
      and not exists (select 1 from public.blocked_series b where b.series_id = m.series_id)
      and (m.visibility = 'shown' or (m.category = 'international' and not m.is_women and s.show_men_intl)
           or (m.category = 'international' and m.is_women and s.show_women_intl)
           or (m.category = 'league' and s.show_leagues)
           or (m.category in ('domestic', 'other') and s.show_domestic))
    order by m.starts_at
  )
  select count(*), string_agg(coalesce(team_a_short, team_a) || ' vs ' || coalesce(team_b_short, team_b), ', ')
         filter (where rn <= 3)
  into n, names
  from (select f.*, row_number() over (order by starts_at) rn from fresh f) x;
  update public.app_settings set last_squads_notice_at = now() where id = 1;
  if n = 0 then return 0; end if;
  perform public.notify(p.id, 'squads_out',
    case when n = 1 then 'Games are open: ' || names else format('Games are open for %s matches', n) end,
    case when n = 1 then 'Squads are out. Join before the lock.' else names || case when n > 3 then format(' and %s more', n - 3) else '' end || '. Join before the lock.' end,
    '/')
  from public.profiles p where not p.blocked and p.can_play;
  return n;
end $$;
revoke all on function public.notify_squads_out() from public, anon, authenticated;
grant execute on function public.notify_squads_out() to service_role;

-- ---------- Tell the admin about automatic money events ----------
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
  if auth.uid() is null and n > 0 then
    perform public.notify_admins('admin_alert', 'Refunded automatically: ' || public.contest_label(c.id),
      format('%s. %s %s got ₹%s back.', p_reason, n, case when n = 1 then 'person' else 'people' end, c.fee), '/admin/match/' || c.match_id);
  end if;
  return n;
end $$;

create or replace function public.drop_for_no_data(p_match text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare m public.matches; c record; n int := 0;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null then return 0; end if;
  if m.series_id is not null then
    insert into public.blocked_series (series_id, reason) values (m.series_id, p_reason) on conflict (series_id) do nothing;
  end if;
  for c in select ct.id from public.contests ct join public.matches mm on mm.id = ct.match_id
           where ct.status in ('open', 'locked', 'scored')
             and (mm.id = m.id or (m.series_id is not null and mm.series_id = m.series_id)) loop
    perform public.refund_contest(c.id, p_reason); n := n + 1;
  end loop;
  insert into public.audit_log (actor_id, area, action, detail)
  values (null, 'auto', 'drop_no_data', jsonb_build_object('match', m.id, 'series', m.series_id, 'reason', p_reason, 'games_refunded', n));
  perform public.notify_admins('admin_alert', 'League removed: ' || coalesce(m.series_name, m.name),
    'CricketData has no squad for it. You can bring it back in Cricket data if that changes.', '/admin/data');
  return n;
end $$;

-- After an automatic payout, the admin gets one line saying who was paid
create or replace function public.notify_payout(p_contest uuid)
returns void language sql security definer set search_path = public as $$
  select public.notify_admins('admin_alert', 'Paid out: ' || public.contest_label(c.id),
    coalesce((select string_agg(p.name || ' ₹' || e.payout, ', ') from public.entries e join public.profiles p on p.id = e.user_id
              where e.contest_id = c.id and e.payout > 0), 'Nobody won money'), '/admin/match/' || c.match_id)
  from public.contests c where c.id = p_contest and c.status = 'paid';
$$;
revoke all on function public.notify_payout(uuid) from public, anon, authenticated;

create or replace function public.process_contests()
returns int language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; n int := 0; players int;
begin
  select * into s from public.app_settings where id = 1;
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
  update public.contests ct set lock_at = public.lock_time_for(ct.match_id, ct.game)
  where ct.status = 'open' and ct.lock_at > now() and ct.lock_at is distinct from public.lock_time_for(ct.match_id, ct.game)
    and public.lock_time_for(ct.match_id, ct.game) is not null;
  return n;
end $$;

-- ---------- Admin: change a member's phone number ----------
create or replace function public.admin_change_phone(p_user uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare ph text := '+91' || right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10); old text;
begin
  if not public.is_admin() then raise exception 'Only the admin can change phone numbers'; end if;
  if ph !~ '^\+91[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit Indian mobile number'; end if;
  select phone into old from public.profiles where id = p_user for update;
  if old is null then raise exception 'Member not found'; end if;
  if old = ph then return; end if;
  if exists (select 1 from public.profiles where phone = ph) then raise exception 'Another member already has that number'; end if;
  delete from public.invites where phone = ph and used_at is null;
  update public.profiles set phone = ph where id = p_user;
  -- the admin's own number is also what makes them admin at sign-in
  update public.app_settings set admin_phone = ph where id = 1 and admin_phone = old;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'members', 'change_phone', jsonb_build_object('member', (select name from public.profiles where id = p_user), 'from', right(old, 4), 'to', right(ph, 4)));
end $$;
revoke all on function public.admin_change_phone(uuid, text) from public, anon;
grant execute on function public.admin_change_phone(uuid, text) to authenticated;
