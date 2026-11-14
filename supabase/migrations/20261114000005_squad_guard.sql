-- =====================================================================
-- Pro11 · Step 4 fix: never pay twice for a squad
--   • squad_attempted_at: set on the FIRST squad request for a match, success or not.
--     Automatic and member requests only run when it is empty, so a match costs at most one squad call
--     (plus the one Playing XI check). Only the admin can deliberately try again.
--   • admin_add_players: paste a whole squad when the data service has none (domestic matches).
-- =====================================================================
alter table public.matches add column if not exists squad_attempted_at timestamptz;

-- Matches already tried (today's VID vs GOA): mark them so nothing retries automatically.
update public.matches m set squad_attempted_at = now()
where squad_attempted_at is null
  and exists (select 1 from public.api_calls a where a.endpoint = 'match_squad' and a.match_id = m.id);

create or replace function public.admin_add_players(p_match text, p_team text, p_names text[], p_role text default 'BAT')
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; nm text;
begin
  if not public.is_admin() then raise exception 'Only the admin can edit squads'; end if;
  if p_role not in ('WK', 'BAT', 'AR', 'BOWL') then raise exception 'Pick a role'; end if;
  if not exists (select 1 from public.matches where id = p_match and p_team in (team_a, team_b)) then raise exception 'Team not in this match'; end if;
  foreach nm in array coalesce(p_names, '{}') loop
    nm := trim(regexp_replace(regexp_replace(nm, '^\s*\d+[.)]\s*', ''), '\s+', ' ', 'g'));
    continue when nm = '' or length(nm) > 60;
    continue when exists (select 1 from public.match_players where match_id = p_match and team = p_team and lower(name) = lower(nm));
    insert into public.match_players (match_id, player_id, name, team, role, manual)
    values (p_match, 'manual-' || replace(gen_random_uuid()::text, '-', ''), nm, p_team, p_role, true);
    n := n + 1;
  end loop;
  if n > 0 then
    insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'games', 'add_players', jsonb_build_object('match', p_match, 'team', p_team, 'count', n));
  end if;
  return n;
end $$;
revoke all on function public.admin_add_players(text, text, text[], text) from public, anon;
grant execute on function public.admin_add_players(text, text, text[], text) to authenticated;
