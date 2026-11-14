-- =====================================================================
-- Pro11 · Fully automatic games. Nothing for the admin to do.
--   • No data, no league: if CricketData gives no squad for a match it flagged, the whole series is
--     removed from the app; its open games are cancelled and refunded.
--   • Playing XI comes only from CricketData (after the toss, and once more from fantasy points after
--     the match). If it never arrives, the game cancels and refunds itself.
--   • Scored games pay out automatically 30 minutes after scoring.
-- =====================================================================

alter table public.app_settings alter column auto_xi_check set default true;
update public.app_settings set auto_xi_check = true where id = 1;
alter table public.matches add column if not exists xi_points_checked_at timestamptz;

create table if not exists public.blocked_series (
  series_id  text primary key,
  reason     text not null,
  blocked_at timestamptz not null default now()
);
alter table public.blocked_series enable row level security;
drop policy if exists blocked_series_read on public.blocked_series;
create policy blocked_series_read on public.blocked_series for select to authenticated using (true);
revoke insert, update, delete on public.blocked_series from anon, authenticated;

-- ---------- Settle (shared by the automatic job and the admin's "Pay out now") ----------
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
    case when e.payout > 0 then format('You won ₹%s!', e.payout) else 'See the final standings.' end, '/match/' || c.match_id || '/xi/results')
  from public.entries e where e.contest_id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', case when auth.uid() is null then 'auto_settle' else 'settle_contest' end,
          jsonb_build_object('contest', c.id, 'pot', pot, 'winners', winners));
  return winners;
end $$;

create or replace function public.admin_settle_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can pay out'; end if;
  if not exists (select 1 from public.contests where id = p_contest and status = 'scored') then raise exception 'Score the game before paying out'; end if;
  return public.settle_contest(p_contest);
end $$;

-- ---------- Remove a whole series (or one match without a series) when CricketData has no data ----------
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
  return n;
end $$;

-- ---------- The 5-minute job: lock, auto-cancel without XI, auto-pay ----------
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
  -- no Playing XI from CricketData after the last automatic try (or 12 h after the lock): refund
  for c in select ct.id from public.contests ct join public.matches m on m.id = ct.match_id
           where ct.game = 'xi' and ct.status = 'locked' and not public.xi_complete(ct.match_id)
             and ((m.ended and m.xi_points_checked_at is not null) or ct.lock_at < now() - interval '12 hours') loop
    perform public.refund_contest(c.id, 'CricketData didn’t publish the Playing XI'); n := n + 1;
  end loop;
  -- pay out 30 minutes after scoring
  for c in select id from public.contests where status = 'scored' and scored_at < now() - interval '30 minutes' loop
    perform public.settle_contest(c.id); n := n + 1;
  end loop;
  -- keep open games' lock time in step with the match time
  update public.contests ct set lock_at = public.lock_time_for(ct.match_id, ct.game)
  where ct.status = 'open' and ct.lock_at > now() and ct.lock_at is distinct from public.lock_time_for(ct.match_id, ct.game)
    and public.lock_time_for(ct.match_id, ct.game) is not null;
  return n;
end $$;

-- ---------- Members' list: hide removed leagues; only matches with data ----------
create or replace view public.match_feed with (security_invoker = true) as
select m.*
from public.matches m
cross join public.app_settings s
where s.id = 1
  and not exists (select 1 from public.blocked_series b where b.series_id = m.series_id)
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
      or exists (select 1 from public.contests c join public.entries e on e.contest_id = c.id where c.match_id = m.id)
    ))
  );
grant select on public.match_feed to authenticated;

-- Admin can bring a removed league back (e.g. after CricketData adds data)
create or replace function public.admin_unblock_series(p_series text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  delete from public.blocked_series where series_id = p_series;
  update public.matches set squad_attempted_at = null where series_id = p_series and squad_fetched_at is null;
  delete from public.series_squad_checks where series_id = p_series;
  insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'matches', 'unblock_series', jsonb_build_object('series', p_series));
end $$;

do $$
begin
  execute 'revoke all on function public.settle_contest(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.drop_for_no_data(text, text) from public, anon, authenticated';
  execute 'grant execute on function public.drop_for_no_data(text, text) to service_role';
  execute 'revoke all on function public.admin_unblock_series(text) from public, anon';
  execute 'grant execute on function public.admin_unblock_series(text) to authenticated';
  execute 'grant execute on function public.admin_settle_contest(uuid) to authenticated';
end $$;
