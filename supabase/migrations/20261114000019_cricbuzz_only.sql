-- =====================================================================
-- Pro11 · Cricbuzz only: the old CricketData parts are removed (credit tracking, its settings and functions),
-- the members' list and the admin's report use Cricbuzz rules only, and Ranks count winnings from the ledger
-- (exact amounts, the same as Ledger shows).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- ---------- CricketData-only functions and tables ----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('admin_update_data_settings', 'admin_set_data_options', 'admin_unblock_series', 'squad_lead_times', 'api_usage_today', 'log_api_call') loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;
drop table if exists public.api_calls cascade;
drop table if exists public.api_usage cascade;

-- ---------- Members' list: Cricbuzz matches only ----------
drop view if exists public.match_feed;
alter table public.app_settings
  drop column if exists daily_credit_cap, drop column if exists list_refresh_hours, drop column if exists fixtures_refresh_hours,
  drop column if exists fixtures_pages, drop column if exists only_game_ready, drop column if exists auto_xi_check,
  drop column if exists live_scores, drop column if exists live_score_minutes, drop column if exists data_source;
alter table public.matches drop column if exists squad_attempted_at;

create view public.match_feed with (security_invoker = true) as
select m.*
from public.matches m
cross join public.app_settings s
where s.id = 1
  and m.id like 'cb-%'
  and not exists (select 1 from public.blocked_series b where b.series_id = m.series_id)
  and (
    exists (select 1 from public.contests c join public.entries e on e.contest_id = c.id where c.match_id = m.id and e.user_id = auth.uid())
    or (
      not m.started and not m.ended and m.starts_at > now() - interval '30 minutes'
      and m.visibility <> 'hidden'
      and (m.visibility = 'shown' or (
           (not m.is_women or s.show_women_intl) and (
             (m.category = 'international' and s.show_men_intl)
          or (m.category = 'league' and s.show_leagues)
          or (m.category in ('domestic', 'other') and s.show_domestic))))
    )
  );
grant select on public.match_feed to authenticated;

-- ---------- The admin's "why" report, with exactly the same rules ----------
create or replace function public.admin_match_report()
returns table (
  id text, name text, series text, category text, format text, starts_at timestamptz, status_text text,
  shown boolean, reason text, hint text, games_open boolean, joined int, fetched_at timestamptz
) language sql stable security definer set search_path = public as $$
  with s as (select * from public.app_settings where id = 1),
  r as (
    select m.*, s.show_women_intl women_on,
      case when m.category = 'international' then s.show_men_intl when m.category = 'league' then s.show_leagues else s.show_domestic end cat_on,
      exists (select 1 from public.blocked_series b where b.series_id = m.series_id) blocked,
      (select count(distinct e.user_id) from public.contests c join public.entries e on e.contest_id = c.id where c.match_id = m.id)::int joined_n
    from public.matches m cross join s
    where m.id like 'cb-%' and public.is_admin()
  )
  select r.id, r.name, r.series_name, r.category, r.format, r.starts_at, r.status_text,
    (not r.blocked and not r.started and not r.ended and r.starts_at > now() - interval '30 minutes' and r.visibility <> 'hidden'
     and (r.visibility = 'shown' or (r.cat_on and (not r.is_women or r.women_on)))) shown,
    case
      when r.ended then 'Finished'
      when r.started then 'Being played'
      when r.starts_at <= now() - interval '30 minutes' then 'Start time passed'
      when r.blocked then 'League removed'
      when r.visibility = 'hidden' then 'You hid it'
      when r.visibility <> 'shown' and r.is_women and not r.women_on then 'Women’s cricket is switched off'
      when r.visibility <> 'shown' and not r.cat_on then
        case r.category when 'international' then 'Men’s internationals are switched off' when 'league' then 'League matches are switched off' else 'Domestic matches are switched off' end
      else 'Shown'
    end reason,
    case
      when r.ended then case when r.joined_n > 0 then 'Members who played see it in My games.' else 'Finished matches aren’t listed.' end
      when r.started then case when r.joined_n > 0 then format('Shown in Live to the %s who joined.', r.joined_n) else 'Nobody joined, so it isn’t listed. Games lock at the toss or start.' end
      when r.starts_at <= now() - interval '30 minutes' then 'Cricbuzz hasn’t marked it live yet; the next update will.'
      when r.blocked then 'Removed from the list.'
      when r.visibility = 'hidden' then 'Admin → Matches → Show or Auto.'
      when r.visibility <> 'shown' and (not r.cat_on or (r.is_women and not r.women_on)) then 'Cricket data → Which matches to show, or set this match to Show.'
      when r.has_squad then 'Games are open.'
      else 'Games open as soon as Cricbuzz publishes the squads.'
    end hint,
    coalesce(r.has_squad, false) games_open, r.joined_n, r.last_synced_at
  from r
  order by (case when r.ended then 3 when r.started then 1 else 2 end), r.starts_at;
$$;
revoke all on function public.admin_match_report() from public, anon;
grant execute on function public.admin_match_report() to authenticated;

-- ---------- Ranks from the ledger (exact amounts, the same as Ledger shows) ----------
drop function if exists public.leaderboard(timestamptz, text);
create or replace function public.leaderboard(p_since timestamptz default null, p_game text default null)
returns table (user_id uuid, name text, color text, played int, won int, winnings numeric, spent numeric, net numeric, bonus int)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.app_settings where id = 1),
  done as (
    select e.*, c.fee, c.id cid from public.entries e join public.contests c on c.id = e.contest_id
    where c.status = 'paid' and (p_game is null or c.game = p_game) and (p_since is null or c.settled_at >= p_since)
  ),
  per as (   -- per player per game: what others owe them, and what they owe
    select d.user_id, d.cid,
           coalesce((select sum(l.amount) from public.ledger_lines l where l.contest_id = d.cid and l.to_user = d.user_id), 0) got,
           coalesce((select sum(l.amount) from public.ledger_lines l where l.contest_id = d.cid and l.from_user = d.user_id), 0) owes,
           (select s.bonus_join from s) + case when d.rank = 1 then (select s.bonus_win from s) when d.rank = 2 then (select s.bonus_second from s) else 0 end
             + d.perfect_sides * (select s.bonus_perfect from s) bonus
    from done d
  )
  select p.id, p.name, p.color,
         count(per.cid)::int,
         count(per.cid) filter (where per.got > per.owes)::int,
         round(coalesce(sum(per.got), 0), 2),
         round(coalesce(sum(per.owes), 0), 2),
         round(coalesce(sum(per.got - per.owes), 0), 2),
         coalesce(sum(per.bonus), 0)::int
  from public.profiles p left join per on per.user_id = p.id
  where not p.blocked and auth.uid() is not null
  group by p.id, p.name, p.color
  order by 8 desc, 5 desc, 4 desc, 2;
$$;
revoke all on function public.leaderboard(timestamptz, text) from public, anon;
grant execute on function public.leaderboard(timestamptz, text) to authenticated;

-- ---------- One game's result as who owes whom (for the results screens) ----------
/** Each player's exact net for one finished game (from the ledger), plus who they owe or who owes them.
    Visible to the players in that game and the admin. */
create or replace function public.contest_nets(p_contest uuid)
returns table (user_id uuid, net numeric, owes_to text, owed_by text)
language sql stable security definer set search_path = public as $$
  select e.user_id,
    round(coalesce((select sum(amount) from public.ledger_lines l where l.contest_id = p_contest and l.to_user = e.user_id), 0)
        - coalesce((select sum(amount) from public.ledger_lines l where l.contest_id = p_contest and l.from_user = e.user_id), 0), 2),
    (select string_agg(p.name, ', ' order by p.name) from public.ledger_lines l join public.profiles p on p.id = l.to_user
      where l.contest_id = p_contest and l.from_user = e.user_id),
    (select string_agg(p.name, ', ' order by p.name) from public.ledger_lines l join public.profiles p on p.id = l.from_user
      where l.contest_id = p_contest and l.to_user = e.user_id)
  from public.entries e
  where e.contest_id = p_contest
    and (public.is_admin() or exists (select 1 from public.entries me where me.contest_id = p_contest and me.user_id = auth.uid()));
$$;
revoke all on function public.contest_nets(uuid) from public, anon;
grant execute on function public.contest_nets(uuid) to authenticated;

-- ---------- Old wallet alerts: remove them (their screens no longer exist) ----------
delete from public.notifications
where kind in ('payment_approved', 'payment_rejected', 'payment_waiting', 'wallet_adjusted', 'withdrawal_paid', 'withdrawal_rejected', 'withdrawal_waiting')
   or kind like 'topup%';
