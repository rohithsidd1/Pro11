-- =====================================================================
-- Pro11 · The wallet is gone for good: its tables, functions, settings and screenshot storage are removed,
-- and games that finished before the ledger existed are copied into it, so the history is complete.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- ---------- Past games → ledger (only games that have no ledger lines yet) ----------
do $$
declare c record; d record; cr record; credit numeric; owed numeric; amt numeric; last_user uuid;
begin
  for c in select * from public.contests ct where ct.status = 'paid' and not exists (select 1 from public.ledger_lines l where l.contest_id = ct.id) loop
    select coalesce(sum(payout - c.fee), 0) into credit from public.entries where contest_id = c.id and payout > c.fee;
    continue when credit <= 0;
    select user_id into last_user from public.entries where contest_id = c.id and payout > c.fee order by created_at desc limit 1;
    for d in select * from public.entries where contest_id = c.id and payout < c.fee loop
      owed := c.fee - d.payout;
      for cr in select * from public.entries where contest_id = c.id and payout > c.fee order by created_at loop
        amt := case when cr.user_id = last_user then owed else round((c.fee - d.payout) * (cr.payout - c.fee) / credit, 2) end;
        owed := owed - amt;
        if amt > 0 then insert into public.ledger_lines (contest_id, from_user, to_user, amount, created_at)
                        values (c.id, d.user_id, cr.user_id, amt, coalesce(c.settled_at, now())); end if;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------- Alerts: no withdrawals; settling up follows the "Settling up" switch ----------
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.app_settings; ok boolean;
begin
  select * into s from public.app_settings where id = 1;
  ok := case
    when p_kind in ('payment_claimed', 'payment_confirmed', 'payment_disputed') then s.n_money
    when p_kind in ('contest_scored', 'contest_paid', 'contest_cancelled') then s.n_results
    when p_kind = 'xi_out' then s.n_xi_out
    when p_kind = 'lock_soon' then s.n_lock_soon
    when p_kind = 'squads_out' then s.n_squads_out
    else true end;
  if ok then
    insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link);
  end if;
end $$;

-- ---------- Adding a member: no starting balance ----------
drop function if exists public.admin_add_member(text, text, text, int);
create or replace function public.admin_add_member(p_name text, p_phone text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare ph text := '+91' || right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if not public.is_admin() then raise exception 'Only the admin can add members'; end if;
  if ph !~ '^\+91[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit Indian mobile number'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter a name'; end if;
  if exists (select 1 from public.profiles where phone = ph) then raise exception 'That number is already a member'; end if;
  insert into public.invites (phone, name, role, created_by)
  values (ph, trim(p_name), coalesce(p_role, 'member'), auth.uid())
  on conflict (phone) do update set name = excluded.name, role = excluded.role, used_at = null;
  insert into public.audit_log (actor_id, area, action, detail) values (auth.uid(), 'members', 'add_member', jsonb_build_object('member', trim(p_name), 'role', p_role));
end $$;
revoke all on function public.admin_add_member(text, text, text) from public, anon;
grant execute on function public.admin_add_member(text, text, text) to authenticated;

create or replace function public.consume_invite(p_user uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invites;
begin
  select * into i from public.invites where phone = p_phone and used_at is null for update;
  if i.phone is null then return; end if;
  update public.invites set used_at = now() where phone = p_phone;
  if i.role = 'admin' then update public.profiles set role = 'admin' where id = p_user; end if;
end $$;

-- ---------- Remove every wallet function (all versions) ----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('admin_adjust_wallet', 'admin_pay_withdrawal', 'admin_reject_withdrawal', 'admin_review_topup',
             'cancel_topup', 'cancel_withdrawal', 'request_withdrawal', 'submit_topup', 'wallet_balance', 'admin_update_money_settings',
             'my_wallet', 'notify_topup', 'notify_withdrawal') loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;

-- ---------- Remove the wallet tables and settings ----------
drop table if exists public.wallet_txns cascade;
drop table if exists public.payment_proofs cascade;
drop table if exists public.withdrawals cascade;
alter table public.app_settings
  drop column if exists min_topup, drop column if exists max_topup, drop column if exists min_withdrawal,
  drop column if exists accept_phonepe, drop column if exists accept_gpay, drop column if exists accept_paytm,
  drop column if exists accept_other_upi, drop column if exists n_withdrawal, drop column if exists upi_id;
alter table public.invites drop column if exists starting_balance;

-- ---------- Remove the payment-screenshot storage ----------
-- On Supabase the storage tables belong to its storage role, so each step may be refused; a refusal is only a notice.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (qual like '%payment-proofs%' or with_check like '%payment-proofs%' or policyname ilike '%proof%') loop
    begin
      execute format('drop policy if exists %I on storage.objects', p.policyname);
    exception when others then
      raise notice 'Could not remove storage rule % (%). Delete the payment-proofs bucket in Supabase → Storage.', p.policyname, sqlerrm;
    end;
  end loop;
  begin
    delete from storage.objects where bucket_id = 'payment-proofs';
    delete from storage.buckets where id = 'payment-proofs';
  exception when others then
    raise notice 'Delete the payment-proofs bucket in Supabase → Storage (%).', sqlerrm;
  end;
end $$;
