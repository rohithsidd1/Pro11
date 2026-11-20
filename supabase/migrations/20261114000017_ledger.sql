-- =====================================================================
-- Pro11 · No wallet. A shared ledger of who owes whom (like Splitwise).
--   • Joining a game needs no balance: the entry is the stake.
--   • When a game finishes, each loser owes the winner(s) their entry (split equally between tied winners;
--     with "top 2" payouts, in proportion to what each winner won). Lines are netted per pair across games.
--   • Settling up happens outside the app: the payer taps "I paid", the receiver confirms.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.ledger_lines (
  id         bigint generated always as identity primary key,
  contest_id uuid not null references public.contests (id) on delete cascade,
  from_user  uuid not null references public.profiles (id) on delete cascade,   -- owes
  to_user    uuid not null references public.profiles (id) on delete cascade,   -- is owed
  amount     numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists ledger_lines_from on public.ledger_lines (from_user);
create index if not exists ledger_lines_to on public.ledger_lines (to_user);

create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles (id) on delete cascade,   -- paid
  to_user    uuid not null references public.profiles (id) on delete cascade,   -- received
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 1000000),
  note       text,
  status     text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists settlements_from on public.settlements (from_user);
create index if not exists settlements_to on public.settlements (to_user);

alter table public.ledger_lines enable row level security;
alter table public.settlements enable row level security;
drop policy if exists ledger_lines_read on public.ledger_lines;
create policy ledger_lines_read on public.ledger_lines for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
drop policy if exists settlements_read on public.settlements;
create policy settlements_read on public.settlements for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
revoke insert, update, delete on public.ledger_lines, public.settlements from anon, authenticated;

-- ₹5 not ₹5.00; ₹12.50 stays
create or replace function public.money_text(v numeric) returns text language sql immutable as $$
  select '₹' || case when v = trunc(v) then trunc(v)::text else to_char(v, 'FM999999990.00') end $$;

-- ---------- Games without a wallet ----------
create or replace function public.join_contest(p_match text, p_game text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; s public.app_settings; v_entry uuid; players int;
begin
  me := public.require_member();
  if not me.can_play then raise exception 'You can’t join games right now. Ask the admin.'; end if;
  if not coalesce(public.squads_ready(p_match), false) then raise exception 'Games open once the squads are announced'; end if;
  c := public.ensure_contest(p_match, p_game);
  select * into s from public.app_settings where id = 1;
  if not c.enabled then raise exception 'This game isn’t running for this match'; end if;
  if c.status <> 'open' or now() >= c.lock_at then raise exception 'This game has locked'; end if;
  if exists (select 1 from public.entries where contest_id = c.id and user_id = me.id) then raise exception 'You’ve already joined'; end if;
  perform 1 from public.contests where id = c.id for update;
  select count(*) into players from public.entries where contest_id = c.id;
  if players >= coalesce(c.max_players, s.max_players) then raise exception 'This game is full (% players)', coalesce(c.max_players, s.max_players); end if;
  insert into public.entries (contest_id, user_id) values (c.id, me.id) returning id into v_entry;
  return v_entry;
end $$;

create or replace function public.leave_contest(p_contest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.contests; e public.entries;
begin
  me := public.require_member();
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status <> 'open' or now() >= c.lock_at then raise exception 'You can’t leave after the lock'; end if;
  select * into e from public.entries where contest_id = c.id and user_id = me.id;
  if e.id is null then raise exception 'You haven’t joined this game'; end if;
  delete from public.entries where id = e.id;
end $$;

create or replace function public.refund_contest(p_contest uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; n int := 0;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status in ('cancelled', 'paid') then return 0; end if;
  select count(*) into n from public.entries where contest_id = c.id;
  perform public.notify(e.user_id, 'contest_cancelled', public.contest_label(c.id) || ' was cancelled',
    p_reason || '. Nobody owes anything for this game.', '/match/' || c.match_id)
  from public.entries e where e.contest_id = c.id;
  update public.contests set status = 'cancelled', cancel_reason = p_reason, settled_at = now(), settled_by = auth.uid() where id = c.id;
  if auth.uid() is null and n > 0 then
    perform public.notify_admins('admin_alert', 'Cancelled automatically: ' || public.contest_label(c.id), p_reason || '.', '/admin/match/' || c.match_id);
  end if;
  return n;
end $$;

-- ---------- Finishing a game: results, then who owes whom ----------
create or replace function public.settle_contest(p_contest uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c public.contests; s public.app_settings; pot int; players int; top numeric; second numeric; n1 int; n2 int;
        first_pot int; second_pot int; w record; d record; cr record; i int; v_amt int; paid int := 0; credit numeric; amt numeric;
        uids uuid[] := '{}'; shares numeric[] := '{}'; k int; j int; dshare numeric; owed numeric; last_j int;
begin
  select * into c from public.contests where id = p_contest for update;
  if c.id is null or c.status <> 'scored' then return 0; end if;
  select * into s from public.app_settings where id = 1;
  select count(*), c.fee * count(*), max(points) into players, pot, top from public.entries where contest_id = c.id;
  select count(*) into n1 from public.entries where contest_id = c.id and points = top;
  select max(points) into second from public.entries where contest_id = c.id and points < top;
  select count(*) into n2 from public.entries where contest_id = c.id and points = second;
  if s.payout_mode = 'top2' and players >= 3 and n1 = 1 and second is not null then
    first_pot := floor(pot * 0.7); second_pot := pot - first_pot;
  else
    first_pot := pot; second_pot := 0;
  end if;
  update public.entries set payout = 0 where contest_id = c.id;
  if s.tie_rule = 'earliest' then n1 := 1; end if;
  i := 0;
  for w in select * from public.entries where contest_id = c.id and points = top order by created_at limit n1 loop
    i := i + 1; v_amt := first_pot / n1 + (case when i = 1 then first_pot - (first_pot / n1) * n1 else 0 end);
    update public.entries set payout = v_amt where id = w.id; paid := paid + 1;
    uids := uids || w.user_id; shares := shares || (first_pot::numeric / n1);   -- exact equal share for the ledger
  end loop;
  if second_pot > 0 then
    if s.tie_rule = 'earliest' then n2 := 1; end if;
    i := 0;
    for w in select * from public.entries where contest_id = c.id and points = second order by created_at limit n2 loop
      i := i + 1; v_amt := second_pot / n2 + (case when i = 1 then second_pot - (second_pot / n2) * n2 else 0 end);
      update public.entries set payout = v_amt where id = w.id; paid := paid + 1;
      uids := uids || w.user_id; shares := shares || (second_pot::numeric / n2);
    end loop;
  end if;
  -- who owes whom, from exact shares (no rounding to whole rupees): every player who lost money owes the
  -- winners in proportion to what each won; tied winners share equally
  delete from public.ledger_lines where contest_id = c.id;
  credit := 0;
  for k in 1 .. coalesce(array_length(uids, 1), 0) loop
    if shares[k] > c.fee then credit := credit + shares[k] - c.fee; end if;
  end loop;
  if credit > 0 then
    for d in select * from public.entries where contest_id = c.id loop
      dshare := 0;
      for k in 1 .. coalesce(array_length(uids, 1), 0) loop if uids[k] = d.user_id then dshare := shares[k]; end if; end loop;
      continue when dshare >= c.fee;
      owed := round(c.fee - dshare, 2); last_j := 0;
      for j in 1 .. array_length(uids, 1) loop if shares[j] > c.fee then last_j := j; end if; end loop;
      for j in 1 .. array_length(uids, 1) loop
        continue when shares[j] <= c.fee;
        -- the last winner takes what's left, so a loser's lines add up to exactly what they lost
        amt := case when j = last_j then owed else round((c.fee - dshare) * (shares[j] - c.fee) / credit, 2) end;
        owed := owed - amt;
        if amt > 0 then insert into public.ledger_lines (contest_id, from_user, to_user, amount) values (c.id, d.user_id, uids[j], amt); end if;
      end loop;
    end loop;
  end if;
  update public.contests set status = 'paid', settled_at = now(), settled_by = auth.uid() where id = c.id;
  perform public.notify(e.user_id, 'contest_paid', public.contest_label(c.id) || ': final results',
    case when coalesce((select sum(amount) from public.ledger_lines where contest_id = c.id and to_user = e.user_id), 0) > 0
           then format('You won! You’re owed %s.', public.money_text((select sum(amount) from public.ledger_lines where contest_id = c.id and to_user = e.user_id)))
         when coalesce((select sum(amount) from public.ledger_lines where contest_id = c.id and from_user = e.user_id), 0) > 0
           then format('You owe %s. See Ledger.', public.money_text((select sum(amount) from public.ledger_lines where contest_id = c.id and from_user = e.user_id)))
         else 'You broke even.' end,
    '/match/' || c.match_id || case c.game when 'xi' then '/xi/results' else '/fantasy/results' end)
  from public.entries e where e.contest_id = c.id;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'games', case when auth.uid() is null then 'auto_settle' else 'settle_contest' end,
          jsonb_build_object('contest', c.id, 'pot', pot, 'winners', paid, 'mode', s.payout_mode));
  return paid;
end $$;
revoke all on function public.settle_contest(uuid) from public, anon, authenticated;

create or replace function public.notify_payout(p_contest uuid)
returns void language sql security definer set search_path = public as $$
  select public.notify_admins('admin_alert', 'Finished: ' || public.contest_label(c.id),
    coalesce((select string_agg(p.name || ' won ₹' || (e.payout - c.fee), ', ') from public.entries e join public.profiles p on p.id = e.user_id
              where e.contest_id = c.id and e.payout > c.fee), 'Nobody won'), '/admin/match/' || c.match_id)
  from public.contests c where c.id = p_contest and c.status = 'paid';
$$;

-- ---------- Balances ----------
/** Per person: what they owe me (positive) or I owe them (negative), plus payments waiting for confirmation. */
create or replace function public.my_balances()
returns table (user_id uuid, name text, color text, upi_id text, net numeric, waiting_out numeric, waiting_in numeric, games int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() id),
  l as (
    select case when from_user = (select id from me) then to_user else from_user end other,
           case when to_user = (select id from me) then amount else -amount end v, contest_id
    from public.ledger_lines where (select id from me) in (from_user, to_user)
  ),
  st as (
    select case when from_user = (select id from me) then to_user else from_user end other,
           case when status = 'confirmed' then (case when from_user = (select id from me) then amount else -amount end) else 0 end v,
           case when status = 'pending' and from_user = (select id from me) then amount else 0 end w_out,
           case when status = 'pending' and to_user = (select id from me) then amount else 0 end w_in
    from public.settlements where (select id from me) in (from_user, to_user)
  ),
  per as (
    select other, sum(v) net, 0::numeric w_out, 0::numeric w_in, count(distinct contest_id)::int games from l group by other
    union all select other, sum(v), sum(w_out), sum(w_in), 0 from st group by other
  )
  select p.id, p.name, p.color, p.upi_id, round(sum(per.net), 2), round(sum(per.w_out), 2), round(sum(per.w_in), 2), sum(per.games)::int
  from per join public.profiles p on p.id = per.other
  group by p.id, p.name, p.color, p.upi_id
  order by abs(sum(per.net)) desc, p.name;
$$;

/** Everything between me and one person, newest first: games and payments, with the running effect on the balance. */
create or replace function public.ledger_with(p_other uuid)
returns table (at timestamptz, kind text, title text, detail text, amount numeric, status text, link text, settlement_id uuid)
language sql stable security definer set search_path = public as $$
  select l.created_at, 'game', public.contest_label(l.contest_id),
         case when l.to_user = auth.uid() then 'You won' else 'You lost' end,
         case when l.to_user = auth.uid() then l.amount else -l.amount end, 'final',
         '/match/' || c.match_id || case c.game when 'xi' then '/xi/results' else '/fantasy/results' end, null::uuid
  from public.ledger_lines l join public.contests c on c.id = l.contest_id
  where (l.from_user = auth.uid() and l.to_user = p_other) or (l.to_user = auth.uid() and l.from_user = p_other)
  union all
  select s.created_at, 'payment', case when s.from_user = auth.uid() then 'You paid' else 'They paid you' end, s.note,
         case when s.from_user = auth.uid() then s.amount else -s.amount end, s.status, null, s.id
  from public.settlements s
  where (s.from_user = auth.uid() and s.to_user = p_other) or (s.to_user = auth.uid() and s.from_user = p_other)
  order by 1 desc;
$$;

/** Admin: who owes whom across everyone (net per pair). */
create or replace function public.admin_ledger()
returns table (debtor uuid, debtor_name text, creditor uuid, creditor_name text, amount numeric)
language sql stable security definer set search_path = public as $$
  with flows as (
    select from_user a, to_user b, amount v from public.ledger_lines
    union all select to_user, from_user, amount from public.settlements where status = 'confirmed'
  ),
  pair as (
    select least(a, b) x, greatest(a, b) y, sum(case when a < b then v else -v end) v from flows group by 1, 2
  )
  select case when v > 0 then x else y end, pd.name, case when v > 0 then y else x end, pc.name, round(abs(v), 2)
  from pair
  join public.profiles pd on pd.id = case when v > 0 then x else y end
  join public.profiles pc on pc.id = case when v > 0 then y else x end
  where public.is_admin() and abs(v) >= 0.01
  order by 5 desc;
$$;

-- ---------- Settling up ----------
create or replace function public.record_payment(p_to uuid, p_amount numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; v uuid;
begin
  me := public.require_member();
  if p_to = me.id then raise exception 'Choose someone else'; end if;
  if not exists (select 1 from public.profiles where id = p_to and not blocked) then raise exception 'Member not found'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > 1000000 then raise exception 'Enter an amount'; end if;
  insert into public.settlements (from_user, to_user, amount, note) values (me.id, p_to, round(p_amount, 2), nullif(left(trim(coalesce(p_note, '')), 120), ''))
  returning id into v;
  perform public.notify(p_to, 'payment_claimed', format('%s says they paid you %s', me.name, public.money_text(round(p_amount, 2))), 'Confirm once it’s in your account.', '/ledger');
  return v;
end $$;

create or replace function public.decide_payment(p_id uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; s public.settlements;
begin
  me := public.require_member();
  select * into s from public.settlements where id = p_id for update;
  if s.id is null or s.to_user <> me.id then raise exception 'Only the person who was paid can confirm'; end if;
  if s.status <> 'pending' then raise exception 'Already %', s.status; end if;
  update public.settlements set status = case when p_confirm then 'confirmed' else 'rejected' end, decided_at = now() where id = p_id;
  perform public.notify(s.from_user, case when p_confirm then 'payment_confirmed' else 'payment_disputed' end,
    case when p_confirm then format('%s confirmed your %s', me.name, public.money_text(s.amount)) else format('%s didn’t receive your %s', me.name, public.money_text(s.amount)) end,
    case when p_confirm then 'Your balance is updated.' else 'Check with them, then record it again.' end, '/ledger');
end $$;

create or replace function public.cancel_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.require_member();
  update public.settlements set status = 'cancelled', decided_at = now() where id = p_id and from_user = me.id and status = 'pending';
  if not found then raise exception 'Only a payment you recorded and that isn’t confirmed yet can be cancelled'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.my_balances()', 'public.ledger_with(uuid)', 'public.admin_ledger()', 'public.record_payment(uuid, numeric, text)',
                           'public.decide_payment(uuid, boolean)', 'public.cancel_payment(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
