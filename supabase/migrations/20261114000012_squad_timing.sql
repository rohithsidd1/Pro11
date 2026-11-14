-- =====================================================================
-- Pro11 · When do squads appear? (free tracking)
--   squad_seen_at = the first time CricketData's list said "has squad" for a match.
--   Admin → Cricket data shows, per series, how many hours before the start squads typically appear.
--   Precision: the list refreshes every 6 hours, so a time is accurate to within one refresh.
-- =====================================================================
alter table public.matches add column if not exists squad_seen_at timestamptz;

create or replace function public.mark_squad_seen()
returns trigger language plpgsql as $$
begin
  if new.has_squad and new.squad_seen_at is null and (tg_op = 'INSERT' or not coalesce(old.has_squad, false)) then
    new.squad_seen_at := now();
  end if;
  return new;
end $$;
drop trigger if exists matches_squad_seen on public.matches;
create trigger matches_squad_seen before insert or update of has_squad on public.matches
for each row execute function public.mark_squad_seen();

create or replace function public.squad_lead_times(p_days int default 30)
returns table (series text, category text, matches int, typical_hours numeric, earliest_hours numeric, latest_hours numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(m.series_name, 'Other matches'), m.category, count(*)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from m.starts_at - m.squad_seen_at) / 3600))::numeric, 1),
         round(max(extract(epoch from m.starts_at - m.squad_seen_at) / 3600)::numeric, 1),
         round(min(extract(epoch from m.starts_at - m.squad_seen_at) / 3600)::numeric, 1)
  from public.matches m
  where public.is_admin() and m.squad_seen_at is not null and m.starts_at > now() - make_interval(days => p_days)
  group by 1, 2
  order by 3 desc, 1;
$$;
revoke all on function public.squad_lead_times(int) from public, anon;
grant execute on function public.squad_lead_times(int) to authenticated;
