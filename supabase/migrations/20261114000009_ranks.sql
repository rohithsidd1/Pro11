-- =====================================================================
-- Pro11 · Step 6: Ranks
-- A family leaderboard: games played, games won, money won and net (won − entries), for any period.
-- Only paid (finished) games count. Cancelled games never count.
-- =====================================================================
drop function if exists public.leaderboard(timestamptz, text);
create or replace function public.leaderboard(p_since timestamptz default null, p_game text default null)
returns table (user_id uuid, name text, color text, played int, won int, winnings int, spent int, net int, best_points numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.color,
         count(e.id)::int,
         count(e.id) filter (where e.payout > 0)::int,
         coalesce(sum(e.payout), 0)::int,
         coalesce(sum(c.fee), 0)::int,
         (coalesce(sum(e.payout), 0) - coalesce(sum(c.fee), 0))::int,
         coalesce(max(e.points), 0)
  from public.profiles p
  left join public.entries e on e.user_id = p.id
    and exists (select 1 from public.contests c2 where c2.id = e.contest_id and c2.status = 'paid'
                and (p_game is null or c2.game = p_game)
                and (p_since is null or c2.settled_at >= p_since))
  left join public.contests c on c.id = e.contest_id
  where not p.blocked and auth.uid() is not null
  group by p.id, p.name, p.color
  order by 6 desc, 5 desc, 4 desc, 2;
$$;
revoke all on function public.leaderboard(timestamptz, text) from public, anon;
grant execute on function public.leaderboard(timestamptz, text) to authenticated;
