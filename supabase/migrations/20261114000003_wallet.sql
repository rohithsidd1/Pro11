-- =====================================================================
-- Pro11 · Step 3: wallet
-- Ledger, top-ups with screenshot proof, withdrawals, admin adjustments,
-- money settings, private screenshot storage.
-- Rules enforced here, not just in the app:
--   • a balance is always the sum of the ledger, never stored
--   • nobody's wallet can go below ₹0
--   • a UPI reference (UTR) can only be used once
--   • every movement of money has a ledger row and an audit-log row
-- Run once in Supabase → SQL Editor (after steps 1 and 2).
-- =====================================================================

-- ---------- Money settings ----------
alter table public.app_settings
  add column if not exists min_topup        int not null default 10   check (min_topup >= 1),
  add column if not exists max_topup        int not null default 2000 check (max_topup >= 1),
  add column if not exists min_withdrawal   int not null default 50   check (min_withdrawal >= 1),
  add column if not exists accept_phonepe   boolean not null default true,
  add column if not exists accept_gpay      boolean not null default true,
  add column if not exists accept_paytm     boolean not null default true,
  add column if not exists accept_other_upi boolean not null default true;

-- ---------- Ledger ----------
create table if not exists public.wallet_txns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      int  not null check (amount <> 0),          -- whole rupees: + in, − out
  kind        text not null check (kind in ('topup', 'withdrawal', 'withdrawal_release', 'entry', 'refund', 'payout', 'adjustment')),
  ref_id      uuid,                                       -- top-up, withdrawal or (step 4) game entry
  note        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists wallet_txns_user_created on public.wallet_txns (user_id, created_at desc);
create index if not exists wallet_txns_created on public.wallet_txns (created_at desc);

create or replace function public.wallet_balance(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from public.wallet_txns where user_id = p_user;
$$;

-- ---------- Top-ups (money paid to the admin, proved by a screenshot) ----------
create table if not exists public.payment_proofs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  amount           int  not null check (amount > 0),
  utr              text check (utr is null or utr ~ '^[0-9]{12}$'),
  app              text not null default 'other' check (app in ('phonepe', 'gpay', 'paytm', 'other')),
  paid_at          timestamptz,
  paid_to          text,
  screenshot_path  text not null,
  ocr              jsonb not null default '{}'::jsonb,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reject_reason    text,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists payment_proofs_user_created on public.payment_proofs (user_id, created_at desc);
create index if not exists payment_proofs_status on public.payment_proofs (status, created_at);
-- One UTR, one live payment. Rejected and cancelled ones don't count, so a corrected upload can reuse it.
create unique index if not exists payment_proofs_utr_once on public.payment_proofs (utr)
  where utr is not null and status in ('pending', 'approved');

-- ---------- Withdrawals (money the admin pays back) ----------
create table if not exists public.withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  amount         int  not null check (amount > 0),
  upi_id         text not null check (upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$'),
  status         text not null default 'pending' check (status in ('pending', 'paid', 'rejected', 'cancelled')),
  utr            text,
  proof_path     text,
  reject_reason  text,
  handled_by     uuid references public.profiles (id) on delete set null,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists withdrawals_user_created on public.withdrawals (user_id, created_at desc);
create index if not exists withdrawals_status on public.withdrawals (status, created_at);

-- ---------- Security ----------
alter table public.wallet_txns    enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.withdrawals    enable row level security;

drop policy if exists wallet_read on public.wallet_txns;
create policy wallet_read on public.wallet_txns for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists proofs_read on public.payment_proofs;
create policy proofs_read on public.payment_proofs for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists withdrawals_read on public.withdrawals;
create policy withdrawals_read on public.withdrawals for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- All writes go through the functions below.
revoke insert, update, delete on public.wallet_txns, public.payment_proofs, public.withdrawals from anon, authenticated;

-- ---------- Private storage for screenshots ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "pro11 proofs upload own" on storage.objects;
create policy "pro11 proofs upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pro11 proofs admin upload payouts" on storage.objects;
create policy "pro11 proofs admin upload payouts" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = 'withdrawals' and public.is_admin());
drop policy if exists "pro11 proofs read" on storage.objects;
create policy "pro11 proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'withdrawals' and (storage.foldername(name))[2] = auth.uid()::text)
    or public.is_admin()
  ));

-- ---------- Internal helpers (not callable from the app) ----------
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link);
$$;

create or replace function public.notify_admins(p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select id, p_kind, p_title, p_body, p_link from public.profiles where role = 'admin' and not blocked;
$$;

create or replace function public.require_member()
returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare v public.profiles;
begin
  select * into v from public.profiles where id = auth.uid();
  if v.id is null then raise exception 'Sign in again'; end if;
  if v.blocked then raise exception 'Your account is blocked. Ask the admin.'; end if;
  return v;
end $$;

revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text, text) from public, anon, authenticated;
revoke all on function public.require_member() from public, anon, authenticated;
revoke all on function public.wallet_balance(uuid) from public, anon;
grant execute on function public.wallet_balance(uuid) to authenticated;

-- ---------- Member actions ----------
create or replace function public.submit_topup(
  p_amount int, p_utr text, p_app text, p_paid_at timestamptz, p_paid_to text, p_path text, p_ocr jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; s public.app_settings; v_utr text; v_id uuid; v_prev timestamptz;
begin
  me := public.require_member();
  select * into s from public.app_settings where id = 1;
  if p_amount is null or p_amount < s.min_topup then raise exception 'The smallest top-up is ₹%', s.min_topup; end if;
  if p_amount > s.max_topup then raise exception 'The largest top-up is ₹%', s.max_topup; end if;
  if p_path is null or p_path not like me.id::text || '/%' then raise exception 'Upload the screenshot again'; end if;
  v_utr := nullif(regexp_replace(coalesce(p_utr, ''), '\D', '', 'g'), '');
  if v_utr is not null and v_utr !~ '^[0-9]{12}$' then raise exception 'A UTR has exactly 12 digits'; end if;
  if v_utr is not null then
    select created_at into v_prev from public.payment_proofs where utr = v_utr and status in ('pending', 'approved') limit 1;
    if found then raise exception 'This UTR was already used for a payment on %', to_char(v_prev at time zone 'Asia/Kolkata', 'DD Mon'); end if;
  end if;
  insert into public.payment_proofs (user_id, amount, utr, app, paid_at, paid_to, screenshot_path, ocr)
  values (me.id, p_amount, v_utr,
          case when p_app in ('phonepe', 'gpay', 'paytm') then p_app else 'other' end,
          p_paid_at, left(p_paid_to, 120), p_path, coalesce(p_ocr, '{}'::jsonb))
  returning id into v_id;
  perform public.notify_admins('payment_waiting', format('₹%s from %s to check', p_amount, me.name), 'Open Payments to approve or reject.', '/admin/payments');
  return v_id;
end $$;

create or replace function public.cancel_topup(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.require_member();
  update public.payment_proofs set status = 'cancelled' where id = p_id and user_id = me.id and status = 'pending';
  if not found then raise exception 'This payment can’t be cancelled any more'; end if;
end $$;

create or replace function public.request_withdrawal(p_amount int, p_upi text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; s public.app_settings; bal int; v_id uuid; v_upi text;
begin
  me := public.require_member();
  select * into s from public.app_settings where id = 1;
  v_upi := lower(trim(coalesce(p_upi, '')));
  if v_upi !~ '^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,64}$' then raise exception 'That doesn’t look like a UPI ID, for example name@okaxis'; end if;
  if p_amount is null or p_amount < s.min_withdrawal then raise exception 'The smallest withdrawal is ₹%', s.min_withdrawal; end if;
  perform 1 from public.profiles where id = me.id for update;           -- one money action at a time per person
  bal := public.wallet_balance(me.id);
  if p_amount > bal then raise exception 'You can withdraw up to ₹%', bal; end if;
  insert into public.withdrawals (user_id, amount, upi_id) values (me.id, p_amount, v_upi) returning id into v_id;
  insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
  values (me.id, -p_amount, 'withdrawal', v_id, 'To ' || v_upi, me.id);
  if me.upi_id is null then update public.profiles set upi_id = v_upi where id = me.id; end if;
  perform public.notify_admins('withdrawal_waiting', format('%s asked to withdraw ₹%s', me.name, p_amount), 'Pay them on UPI, then mark it paid.', '/admin/withdrawals');
  return v_id;
end $$;

create or replace function public.cancel_withdrawal(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; w public.withdrawals;
begin
  me := public.require_member();
  perform 1 from public.profiles where id = me.id for update;
  select * into w from public.withdrawals where id = p_id and user_id = me.id for update;
  if w.id is null or w.status <> 'pending' then raise exception 'This withdrawal can’t be cancelled any more'; end if;
  update public.withdrawals set status = 'cancelled', handled_at = now() where id = w.id;
  insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
  values (me.id, w.amount, 'withdrawal_release', w.id, 'Withdrawal cancelled', me.id);
end $$;

-- ---------- Admin actions ----------
create or replace function public.admin_review_topup(p_id uuid, p_approve boolean, p_amount int default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payment_proofs; final int;
begin
  if not public.is_admin() then raise exception 'Only the admin can review payments'; end if;
  select * into p from public.payment_proofs where id = p_id for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  if p.status <> 'pending' then raise exception 'This payment was already %', p.status; end if;
  if p_approve then
    final := coalesce(p_amount, p.amount);
    if final <= 0 then raise exception 'Amount must be more than ₹0'; end if;
    update public.payment_proofs set status = 'approved', amount = final, reviewed_by = auth.uid(), reviewed_at = now() where id = p.id;
    insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
    values (p.user_id, final, 'topup', p.id,
            (case p.app when 'phonepe' then 'PhonePe' when 'gpay' then 'GPay' when 'paytm' then 'Paytm' else 'UPI' end) || coalesce(', UTR ' || p.utr, ''),
            auth.uid());
    perform public.notify(p.user_id, 'payment_approved', format('₹%s added to your wallet', final), 'Your payment was approved.', '/wallet/payment/' || p.id);
    insert into public.audit_log (actor_id, area, action, detail)
    values (auth.uid(), 'money', 'approve_topup', jsonb_build_object('payment', p.id, 'amount', final, 'claimed', p.amount));
  else
    if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason so they know what to fix'; end if;
    update public.payment_proofs set status = 'rejected', reject_reason = left(trim(p_reason), 300), reviewed_by = auth.uid(), reviewed_at = now() where id = p.id;
    perform public.notify(p.user_id, 'payment_rejected', format('Your ₹%s payment was rejected', p.amount), left(trim(p_reason), 300), '/wallet/payment/' || p.id);
    insert into public.audit_log (actor_id, area, action, detail)
    values (auth.uid(), 'money', 'reject_topup', jsonb_build_object('payment', p.id, 'amount', p.amount, 'reason', p_reason));
  end if;
end $$;

create or replace function public.admin_pay_withdrawal(p_id uuid, p_utr text default null, p_proof_path text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w public.withdrawals;
begin
  if not public.is_admin() then raise exception 'Only the admin can pay withdrawals'; end if;
  select * into w from public.withdrawals where id = p_id for update;
  if w.id is null or w.status <> 'pending' then raise exception 'This withdrawal isn’t waiting any more'; end if;
  update public.withdrawals set status = 'paid', utr = nullif(trim(coalesce(p_utr, '')), ''), proof_path = p_proof_path,
         handled_by = auth.uid(), handled_at = now() where id = w.id;
  perform public.notify(w.user_id, 'withdrawal_paid', format('₹%s sent to %s', w.amount, w.upi_id), 'Your withdrawal was paid.', '/wallet/withdrawal/' || w.id);
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'money', 'pay_withdrawal', jsonb_build_object('withdrawal', w.id, 'amount', w.amount));
end $$;

create or replace function public.admin_reject_withdrawal(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare w public.withdrawals;
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason'; end if;
  select * into w from public.withdrawals where id = p_id for update;
  if w.id is null or w.status <> 'pending' then raise exception 'This withdrawal isn’t waiting any more'; end if;
  update public.withdrawals set status = 'rejected', reject_reason = left(trim(p_reason), 300), handled_by = auth.uid(), handled_at = now() where id = w.id;
  insert into public.wallet_txns (user_id, amount, kind, ref_id, note, created_by)
  values (w.user_id, w.amount, 'withdrawal_release', w.id, 'Withdrawal rejected', auth.uid());
  perform public.notify(w.user_id, 'withdrawal_rejected', format('Your ₹%s withdrawal was rejected', w.amount), left(trim(p_reason), 300), '/wallet/withdrawal/' || w.id);
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'money', 'reject_withdrawal', jsonb_build_object('withdrawal', w.id, 'amount', w.amount, 'reason', p_reason));
end $$;

create or replace function public.admin_adjust_wallet(p_user uuid, p_amount int, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare bal int; who text;
begin
  if not public.is_admin() then raise exception 'Only the admin can adjust wallets'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'Enter an amount'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason'; end if;
  select name into who from public.profiles where id = p_user for update;
  if who is null then raise exception 'Member not found'; end if;
  bal := public.wallet_balance(p_user);
  if bal + p_amount < 0 then raise exception '% only has ₹%. A wallet can’t go below ₹0.', who, bal; end if;
  insert into public.wallet_txns (user_id, amount, kind, note, created_by) values (p_user, p_amount, 'adjustment', left(trim(p_reason), 200), auth.uid());
  perform public.notify(p_user, 'wallet_adjusted',
    case when p_amount > 0 then format('₹%s added by the admin', p_amount) else format('₹%s taken by the admin', -p_amount) end,
    left(trim(p_reason), 200), '/wallet');
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'money', 'adjust_wallet', jsonb_build_object('member', who, 'amount', p_amount, 'reason', p_reason));
  return bal + p_amount;
end $$;

create or replace function public.admin_update_money_settings(
  p_upi_id text, p_payee_name text, p_min_topup int, p_max_topup int, p_min_withdrawal int,
  p_accept_phonepe boolean, p_accept_gpay boolean, p_accept_paytm boolean, p_accept_other_upi boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can change settings'; end if;
  if lower(trim(p_upi_id)) !~ '^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,64}$' then raise exception 'That doesn’t look like a UPI ID'; end if;
  if coalesce(trim(p_payee_name), '') = '' then raise exception 'Enter the name payers see'; end if;
  if p_min_topup > p_max_topup then raise exception 'The smallest top-up can’t be more than the largest'; end if;
  update public.app_settings set
    upi_id = lower(trim(p_upi_id)), payee_name = trim(p_payee_name),
    min_topup = p_min_topup, max_topup = p_max_topup, min_withdrawal = p_min_withdrawal,
    accept_phonepe = p_accept_phonepe, accept_gpay = p_accept_gpay, accept_paytm = p_accept_paytm, accept_other_upi = p_accept_other_upi,
    updated_at = now()
  where id = 1;
  insert into public.audit_log (actor_id, area, action) values (auth.uid(), 'settings', 'update_money');
end $$;

-- Who can call what
revoke all on function public.submit_topup(int, text, text, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.cancel_topup(uuid) from public, anon;
revoke all on function public.request_withdrawal(int, text) from public, anon;
revoke all on function public.cancel_withdrawal(uuid) from public, anon;
revoke all on function public.admin_review_topup(uuid, boolean, int, text) from public, anon;
revoke all on function public.admin_pay_withdrawal(uuid, text, text) from public, anon;
revoke all on function public.admin_reject_withdrawal(uuid, text) from public, anon;
revoke all on function public.admin_adjust_wallet(uuid, int, text) from public, anon;
revoke all on function public.admin_update_money_settings(text, text, int, int, int, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.submit_topup(int, text, text, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.cancel_topup(uuid) to authenticated;
grant execute on function public.request_withdrawal(int, text) to authenticated;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;
grant execute on function public.admin_review_topup(uuid, boolean, int, text) to authenticated;
grant execute on function public.admin_pay_withdrawal(uuid, text, text) to authenticated;
grant execute on function public.admin_reject_withdrawal(uuid, text) to authenticated;
grant execute on function public.admin_adjust_wallet(uuid, int, text) to authenticated;
grant execute on function public.admin_update_money_settings(text, text, int, int, int, boolean, boolean, boolean, boolean) to authenticated;
