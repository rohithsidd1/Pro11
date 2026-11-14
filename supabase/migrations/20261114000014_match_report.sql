-- =====================================================================
-- Pro11 · "Why can't members see this match?"
-- For the admin: every match Pro11 has, whether members see it, the exact reason if not,
-- and when it's expected to change. Uses exactly the same rules as the members' list (match_feed).
-- =====================================================================
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
      s.only_game_ready only_ready,
      coalesce((select h from lead where lead.k = coalesce(m.series_name, '')), (select h from lead_cat where lead_cat.k = m.category)) lead_h
    from public.matches m cross join s left join j on j.match_id = m.id
    where public.is_admin() and m.starts_at > now() - interval '3 days'
  )
  select r.id, r.name, r.series_name, r.category, r.format, r.starts_at, r.status_text,
    -- shown to members who haven't joined (same rules as match_feed)
    (not r.blocked and not r.started and not r.ended and r.starts_at > now() - interval '30 minutes' and r.visibility <> 'hidden'
     and (r.visibility = 'shown' or r.cat_on) and (not r.only_ready or r.fantasy_ok or r.visibility = 'shown')) shown,
    case
      when r.blocked then 'League removed'
      when r.ended then 'Finished'
      when r.started then 'Being played'
      when r.starts_at <= now() - interval '30 minutes' then 'Start time passed'
      when r.visibility = 'hidden' then 'You hid it'
      when r.visibility <> 'shown' and not r.cat_on then
        case when r.category in ('domestic', 'other') then 'Domestic matches are switched off'
             when r.category = 'league' then 'League matches are switched off'
             when r.is_women then 'Women’s internationals are switched off'
             else 'Men’s internationals are switched off' end
      when r.only_ready and not r.fantasy_ok and r.visibility <> 'shown' then 'No fantasy data from CricketData'
      else 'Shown'
    end reason,
    case
      when r.blocked then 'CricketData had no squad for this league. Cricket data → Leagues removed → Bring back, if that changes.'
      when r.ended then case when r.joined_n > 0 then 'Members who played see it in My games.' else 'Finished matches aren’t listed.' end
      when r.started then case when r.joined_n > 0 then format('Shown in Live to the %s who joined.', r.joined_n) else 'Nobody joined, so it isn’t listed. Games lock at the toss or start.' end
      when r.starts_at <= now() - interval '30 minutes' then 'CricketData hasn’t marked it live yet; the next list refresh will.'
      when r.visibility = 'hidden' then 'Admin → Matches → Show or Auto.'
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
revoke all on function public.admin_match_report() from public, anon;
grant execute on function public.admin_match_report() to authenticated;

-- ---------- Squad timing: only count squads seen before the match starts ----------
create or replace function public.mark_squad_seen()
returns trigger language plpgsql as $$
begin
  if new.has_squad and new.squad_seen_at is null and new.starts_at > now()
     and (tg_op = 'INSERT' or not coalesce(old.has_squad, false)) then
    new.squad_seen_at := now();
  end if;
  return new;
end $$;
update public.matches set squad_seen_at = null where squad_seen_at is not null and squad_seen_at >= starts_at;

create or replace function public.squad_lead_times(p_days int default 30)
returns table (series text, category text, matches int, typical_hours numeric, earliest_hours numeric, latest_hours numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(m.series_name, 'Other matches'), m.category, count(*)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from m.starts_at - m.squad_seen_at) / 3600))::numeric, 1),
         round(max(extract(epoch from m.starts_at - m.squad_seen_at) / 3600)::numeric, 1),
         round(min(extract(epoch from m.starts_at - m.squad_seen_at) / 3600)::numeric, 1)
  from public.matches m
  where public.is_admin() and m.squad_seen_at is not null and m.squad_seen_at < m.starts_at
    and m.starts_at > now() - make_interval(days => p_days)
  group by 1, 2
  order by 3 desc, 1;
$$;
