-- =====================================================================
-- Pro11 · Step 1: foundation
-- Settings, people, sign-in codes, notifications, audit log.
-- Run once in Supabase → SQL Editor, or `supabase db push`.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- App settings (one row) ----------
create table if not exists public.app_settings (
  id                        int primary key default 1 check (id = 1),
  app_name                  text not null default 'Pro11',
  admin_name                text not null,
  admin_phone               text not null,              -- +91XXXXXXXXXX
  upi_id                    text not null,
  payee_name                text not null,
  code_length               int  not null default 6  check (code_length between 4 and 8),
  code_ttl_minutes          int  not null default 5  check (code_ttl_minutes between 1 and 30),
  session_days              int  not null default 30 check (session_days between 1 and 365),
  code_requests_per_hour    int  not null default 3  check (code_requests_per_hour between 1 and 20),
  members_only_codes        boolean not null default false,
  notify_admin_each_request boolean not null default true,
  session_epoch             int  not null default 1,   -- bump to sign everyone out
  updated_at                timestamptz not null default now()
);

insert into public.app_settings (admin_name, admin_phone, upi_id, payee_name)
values ('Rohith Siddanathi', '+917799292381', '77992923-2@ybl', 'Rohith Siddanathi')
on conflict (id) do nothing;

-- ---------- People ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 40),
  phone        text not null unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  role         text not null default 'member' check (role in ('member', 'admin')),
  color        text not null default '#FFD3EF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  upi_id       text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$'),
  can_play     boolean not null default true,
  blocked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

-- ---------- Sign-in codes (shown to the admin, who shares them) ----------
create table if not exists public.otp_requests (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  name        text not null,
  code        text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'used', 'expired', 'blocked', 'ignored')),
  attempts    int  not null default 0,
  is_member   boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index if not exists otp_requests_phone_created  on public.otp_requests (phone, created_at desc);
create index if not exists otp_requests_status_created on public.otp_requests (status, created_at desc);

-- ---------- Notifications + web push (used from step 6) ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------- Audit log ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  area       text not null check (area in ('money', 'matches', 'members', 'settings', 'auto')),
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created on public.audit_log (created_at desc);

-- ---------- Helpers ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not blocked);
$$;

-- ---------- Row level security ----------
alter table public.app_settings       enable row level security;
alter table public.profiles           enable row level security;
alter table public.otp_requests       enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_log          enable row level security;

-- settings: every signed-in member can read, only admins change
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists settings_admin_write on public.app_settings;
create policy settings_admin_write on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.app_settings from anon, authenticated;

-- profiles: family can see each other; you can edit your own name, colour and UPI ID only
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, color, upi_id) on public.profiles to authenticated;

-- sign-in codes: admins only (the edge functions use the secret key)
drop policy if exists otp_admin_read on public.otp_requests;
create policy otp_admin_read on public.otp_requests for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.otp_requests from anon, authenticated;

-- notifications: your own; you can only mark them read
drop policy if exists notif_own_read on public.notifications;
create policy notif_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_own_update on public.notifications;
create policy notif_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- push subscriptions: your own
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: admins read; written only by server functions
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ---------- Admin actions ----------
create or replace function public.admin_update_member(
  p_id uuid, p_role text default null, p_blocked boolean default null,
  p_can_play boolean default null, p_name text default null
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  if not public.is_admin() then raise exception 'Only the admin can change members'; end if;
  if p_id = auth.uid() and (p_role is not null or p_blocked is not null) then
    raise exception 'You can’t change your own role or block yourself';
  end if;
  update public.profiles set
    role     = coalesce(p_role, role),
    blocked  = coalesce(p_blocked, blocked),
    can_play = coalesce(p_can_play, can_play),
    name     = coalesce(nullif(trim(p_name), ''), name)
  where id = p_id returning * into v;
  if v.id is null then raise exception 'Member not found'; end if;
  insert into public.audit_log (actor_id, area, action, detail)
  values (auth.uid(), 'members', 'update_member',
          jsonb_strip_nulls(jsonb_build_object('member', v.name, 'role', p_role, 'blocked', p_blocked,
                                               'can_play', p_can_play, 'name', p_name)));
  return v;
end $$;

create or replace function public.admin_set_code_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  if p_status not in ('ignored', 'expired') then raise exception 'Bad status'; end if;
  update public.otp_requests set status = p_status where id = p_id and status in ('pending', 'blocked');
end $$;

create or replace function public.admin_sign_everyone_out()
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_admin() then raise exception 'Only the admin can do this'; end if;
  update public.app_settings set session_epoch = session_epoch + 1, updated_at = now()
  where id = 1 returning session_epoch into v;
  insert into public.audit_log (actor_id, area, action) values (auth.uid(), 'settings', 'sign_everyone_out');
  return v;
end $$;

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

revoke all on function public.admin_update_member(uuid, text, boolean, boolean, text) from public, anon;
revoke all on function public.admin_set_code_status(uuid, text) from public, anon;
revoke all on function public.admin_sign_everyone_out() from public, anon;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.admin_update_member(uuid, text, boolean, boolean, text) to authenticated;
grant execute on function public.admin_set_code_status(uuid, text) to authenticated;
grant execute on function public.admin_sign_everyone_out() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
