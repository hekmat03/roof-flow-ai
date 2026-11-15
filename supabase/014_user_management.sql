-- 014_user_management.sql — team roles, disabling users, and email invites.
-- Run AFTER 013_tenant_column_guard.sql. Safe to re-run. Deletes no data.
--
-- Model: a workspace (tenant) has one OWNER and any number of ADMINs / MEMBERS.
-- Everyone in a workspace shares its leads (RLS already scopes by tenant). Existing
-- users all become the owner of their own workspace, so nothing changes for them.
-- Roles and invites are managed ONLY by the server (service role); the browser can
-- read its own profile row but never write it.

alter table public.profiles
  add column if not exists role      text    not null default 'owner',
  add column if not exists full_name text,
  add column if not exists disabled  boolean not null default false;

do $$ begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('owner', 'admin', 'member'));
exception when duplicate_object then null; end $$;

-- At most one owner per workspace.
create unique index if not exists profiles_one_owner_idx
  on public.profiles (tenant_id) where role = 'owner';

-- A disabled user resolves to no workspace, so every tenant-scoped RLS policy
-- (leads, settings, ...) stops returning rows for them immediately.
create or replace function public.my_tenant()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from public.profiles
   where user_id = auth.uid() and disabled = false
$$;

-- Pending invitations. Only a SHA-256 hash of the secret link token is stored.
create table if not exists public.team_invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'member')),
  token_hash  text not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists team_invites_open_email_idx
  on public.team_invites (tenant_id, lower(email)) where accepted_at is null;

alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;
grant select, insert, update, delete on public.team_invites to service_role;
