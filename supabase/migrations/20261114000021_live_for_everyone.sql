-- =====================================================================
-- Pro11 · Live matches stay listed for everyone (with their Cricbuzz status and score) until they finish,
-- whether or not anyone joined. Finished matches nobody joined still drop off. The admin's report matches.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================
drop view if exists public.match_feed;
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
      not m.ended
      -- upcoming (until 30 min past the start), or live: live matches stay listed for everyone until they finish
      and ((not m.started and m.starts_at > now() - interval '30 minutes') or (m.started and m.starts_at > now() - interval '5 days'))
      and m.visibility <> 'hidden'
      and (m.visibility = 'shown' or (
           (not m.is_women or s.show_women_intl) and (
             (m.category = 'international' and s.show_men_intl)
          or (m.category = 'league' and s.show_leagues)
          or (m.category in ('domestic', 'other') and s.show_domestic))))
    )
  );
grant select on public.match_feed to authenticated;

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
    (not r.blocked and not r.ended
     and ((not r.started and r.starts_at > now() - interval '30 minutes') or (r.started and r.starts_at > now() - interval '5 days'))
     and r.visibility <> 'hidden'
     and (r.visibility = 'shown' or (r.cat_on and (not r.is_women or r.women_on)))) shown,
    case
      when r.ended then 'Finished'
      when not r.started and r.starts_at <= now() - interval '30 minutes' then 'Start time passed'
      when r.blocked then 'League removed'
      when r.visibility = 'hidden' then 'You hid it'
      when r.visibility <> 'shown' and r.is_women and not r.women_on then 'Women’s cricket is switched off'
      when r.visibility <> 'shown' and not r.cat_on then
        case r.category when 'international' then 'Men’s internationals are switched off' when 'league' then 'League matches are switched off' else 'Domestic matches are switched off' end
      else 'Shown'
    end reason,
    case
      when r.ended then case when r.joined_n > 0 then 'Members who played see it in My games.' else 'Finished matches aren’t listed.' end
      when not r.started and r.starts_at <= now() - interval '30 minutes' then 'Cricbuzz hasn’t marked it live yet; the next update will.'
      when r.blocked then 'Removed from the list.'
      when r.visibility = 'hidden' then 'Admin → Matches → Show or Auto.'
      when r.visibility <> 'shown' and (not r.cat_on or (r.is_women and not r.women_on)) then 'Cricket data → Which matches to show, or set this match to Show.'
      when r.started then 'Live now: shown with its Cricbuzz status and score, updated every 5 minutes.'
      when r.has_squad then 'Games are open.'
      else 'Games open as soon as Cricbuzz publishes the squads.'
    end hint,
    coalesce(r.has_squad, false) games_open, r.joined_n, r.last_synced_at
  from r
  order by (case when r.ended then 3 when r.started then 1 else 2 end), r.starts_at;
$$;
revoke all on function public.admin_match_report() from public, anon;
grant execute on function public.admin_match_report() to authenticated;
