-- =====================================================================
-- Pro11 · Cricbuzz, continuous: the sync runs every minute (live joined matches every minute,
-- everything else every 5 minutes); members see Cricbuzz matches only; women's cricket off everywhere.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================
alter table public.app_settings drop constraint if exists app_settings_cb_list_minutes_check;
alter table public.app_settings add constraint app_settings_cb_list_minutes_check check (cb_list_minutes between 1 and 360);
alter table public.app_settings drop constraint if exists app_settings_cb_live_minutes_check;
alter table public.app_settings add constraint app_settings_cb_live_minutes_check check (cb_live_minutes between 1 and 60);
update public.app_settings set data_source = 'cricbuzz', cb_list_minutes = 5, cb_live_minutes = 1, show_women_intl = false where id = 1;

select cron.unschedule('pro11-cricket-tick') where exists (select 1 from cron.job where jobname = 'pro11-cricket-tick');
select cron.schedule(
  'pro11-cricket-tick',
  '* * * * *',
  $job$
  select net.http_post(
    url     := 'https://mdtqgovuodwspxztsvps.supabase.co/functions/v1/sync-cricket',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-sync-token', (select token from private.sync_config where id = 1)),
    body    := '{"mode":"tick"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- Members' list: Cricbuzz matches only (when Cricbuzz is the source); women's cricket only if switched on
create or replace view public.match_feed with (security_invoker = true) as
select m.*
from public.matches m
cross join public.app_settings s
where s.id = 1
  and (s.data_source <> 'cricbuzz' or m.id like 'cb-%')
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
          or (m.category in ('domestic', 'other') and s.show_domestic)))
      )
      and (not s.only_game_ready or m.fantasy_ok or m.visibility = 'shown')
    )
  );
grant select on public.match_feed to authenticated;

-- The admin's "why" report, with the same rules
create or replace function public.admin_match_report()
returns table (
  id text, name text, series text, category text, format text, starts_at timestamptz, status_text text,
  shown boolean, reason text, hint text, games_open boolean, joined int, fetched_at timestamptz
) language sql stable security definer set search_path = public as $$
  with s as (select * from public.app_settings where id = 1),
  lead as (  -- typical hours before the start that squads appear, per series and per category (last 60 days)
    select coalesce(series_name, '') k, percentile_cont(0.5) within group (order by extract(epoch from starts_at - squad_seen_at) / 3600) h
    from public.matches where squad_seen_at is not null and squad_seen_at < starts_at and starts_at > now() - interval '60 days' group by 1
  ), lead_cat as (
    select category k, percentile_cont(0.5) within group (order by extract(epoch from starts_at - squad_seen_at) / 3600) h
    from public.matches where squad_seen_at is not null and squad_seen_at < starts_at and starts_at > now() - interval '60 days' group by 1
  ), j as (
    select c.match_id, count(e.id)::int n from public.contests c join public.entries e on e.contest_id = c.id group by 1
  ), r as (
    select m.*, coalesce(j.n, 0) joined_n,
      exists (select 1 from public.blocked_series b where b.series_id = m.series_id) blocked,
      (m.category = 'international' and not m.is_women and s.show_men_intl)
        or (m.category = 'international' and m.is_women and s.show_women_intl)
        or (m.category = 'league' and s.show_leagues)
        or (m.category in ('domestic', 'other') and s.show_domestic) cat_on,
      s.only_game_ready only_ready, s.show_women_intl women_on,
      (s.data_source <> 'cricbuzz' or m.id like 'cb-%') from_source,
      coalesce((select h from lead where lead.k = coalesce(m.series_name, '')), (select h from lead_cat where lead_cat.k = m.category)) lead_h
    from public.matches m cross join s left join j on j.match_id = m.id
    where public.is_admin() and m.starts_at > now() - interval '3 days'
  )
  select r.id, r.name, r.series_name, r.category, r.format, r.starts_at, r.status_text,
    -- shown to members who haven't joined (same rules as match_feed)
    (not r.blocked and r.from_source and not r.started and not r.ended and r.starts_at > now() - interval '30 minutes' and r.visibility <> 'hidden'
     and (r.visibility = 'shown' or (r.cat_on and (not r.is_women or r.women_on))) and (not r.only_ready or r.fantasy_ok or r.visibility = 'shown')) shown,
    case
      when not r.from_source then 'Not from Cricbuzz'
      when r.blocked then 'League removed'
      when r.ended then 'Finished'
      when r.started then 'Being played'
      when r.starts_at <= now() - interval '30 minutes' then 'Start time passed'
      when r.visibility = 'hidden' then 'You hid it'
      when r.visibility <> 'shown' and r.is_women and not r.women_on then 'Women’s cricket is switched off'
      when r.visibility <> 'shown' and not r.cat_on then
        case when r.category in ('domestic', 'other') then 'Domestic matches are switched off'
             when r.category = 'league' then 'League matches are switched off'
             when r.is_women then 'Women’s internationals are switched off'
             else 'Men’s internationals are switched off' end
      when r.only_ready and not r.fantasy_ok and r.visibility <> 'shown' then 'No fantasy data from CricketData'
      else 'Shown'
    end reason,
    case
      when not r.from_source then 'An old CricketData match. Pro11 now uses Cricbuzz only.'
      when r.blocked then 'CricketData had no squad for this league. Cricket data → Leagues removed → Bring back, if that changes.'
      when r.ended then case when r.joined_n > 0 then 'Members who played see it in My games.' else 'Finished matches aren’t listed.' end
      when r.started then case when r.joined_n > 0 then format('Shown in Live to the %s who joined.', r.joined_n) else 'Nobody joined, so it isn’t listed. Games lock at the toss or start.' end
      when r.starts_at <= now() - interval '30 minutes' then 'CricketData hasn’t marked it live yet; the next list refresh will.'
      when r.visibility = 'hidden' then 'Admin → Matches → Show or Auto.'
      when r.visibility <> 'shown' and r.is_women and not r.women_on then 'Cricket data → Which matches to show.'
      when r.visibility <> 'shown' and not r.cat_on then 'Cricket data → Which matches to show, or set this match to Show.'
      when r.only_ready and not r.fantasy_ok and r.visibility <> 'shown' then
        'Games need CricketData’s fantasy data. It may switch on closer to the start; many domestic matches never get it. Checked every list refresh.'
      when r.has_squad or r.squad_fetched_at is not null then 'Games are open.'
      when r.lead_h is not null then format('Games open once squads are out: usually about %s hours before the start for this %s, around %s IST.',
            round(r.lead_h::numeric), case when r.series_name is not null then 'series' else 'kind of match' end,
            to_char((r.starts_at - make_interval(hours => greatest(0, round(r.lead_h::numeric)::int))) at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'))
      else 'Games open once squads are out. No history yet for this series to estimate when.'
    end hint,
    (r.has_squad or r.squad_fetched_at is not null) games_open,
    r.joined_n, r.last_synced_at
  from r
  order by (case when r.ended then 3 when r.started then 1 else 2 end), r.starts_at;
$$;
