-- ============================================================================
-- RoofFlow AI — Step 1: multi-tenant schema + Row Level Security
-- Safe to re-run. Run in Supabase -> SQL Editor. Supersedes tenants.sql.
-- ============================================================================

-- 1. tenants — one per contractor company; also holds that tenant's settings
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  settings   jsonb not null default '{}'::jsonb,
  prompts    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tenants
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists prompts  jsonb not null default '{}'::jsonb;

-- 2. profiles — one per auth user (plan columns are written server-side only)
create table if not exists public.profiles (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  email               text,
  tenant_id           uuid references public.tenants (id),
  current_plan        text not null default 'free',
  subscription_status text not null default 'none',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants (id);

create index if not exists profiles_tenant_idx
  on public.profiles (tenant_id);

-- 3. leads — tenant-scoped (existing legacy columns are kept untouched)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid()
);

alter table public.leads
  add column if not exists tenant_id          uuid references public.tenants (id) on delete cascade,
  add column if not exists name               text,
  add column if not exists phone              text,
  add column if not exists email              text,
  add column if not exists zip_code           text,
  add column if not exists roof_issue         text,
  add column if not exists status             text,
  add column if not exists property_ownership text,
  add column if not exists scheduled_date     text,
  add column if not exists appointment        jsonb,
  add column if not exists agent_type         text,
  add column if not exists conversation       jsonb,
  add column if not exists created_at         timestamptz not null default now(),
  add column if not exists updated_at         timestamptz not null default now();

-- Legacy NOT NULL constraints from the earlier app must not block inserts.
do $$ begin
  alter table public.leads alter column session_id drop not null;
exception when undefined_column then null; end $$;

do $$ begin
  alter table public.leads alter column contact_key drop not null;
exception when undefined_column then null; end $$;

create index if not exists leads_tenant_idx
  on public.leads (tenant_id);

create index if not exists leads_tenant_created_idx
  on public.leads (tenant_id, created_at desc);

-- 4. Helper: the caller's tenant (security definer avoids RLS recursion)
create or replace function public.my_tenant()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from public.profiles where user_id = auth.uid()
$$;

-- 5. Every new signup gets a profile AND its own tenant
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare t uuid;
begin
  insert into public.tenants (name)
  values (coalesce(new.email, 'New contractor'))
  returning id into t;

  insert into public.profiles (user_id, email, tenant_id)
  values (new.id, new.email, t)
  on conflict (user_id) do update
    set tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id);

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: existing users without a tenant get one
do $$
declare r record; t uuid;
begin
  for r in select user_id, email from public.profiles where tenant_id is null loop
    insert into public.tenants (name)
    values (coalesce(r.email, 'Contractor'))
    returning id into t;

    update public.profiles
       set tenant_id = t
     where user_id = r.user_id;
  end loop;
end $$;

-- 6. Row Level Security
alter table public.tenants  enable row level security;
alter table public.profiles enable row level security;
alter table public.leads    enable row level security;

drop policy if exists tenants_own on public.tenants;
drop policy if exists tenants_select on public.tenants;
drop policy if exists tenants_update on public.tenants;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;

-- tenants: read + update your own row (settings/prompts). No insert/delete.
create policy tenants_select on public.tenants
  for select to authenticated using (id = public.my_tenant());

create policy tenants_update on public.tenants
  for update to authenticated
  using (id = public.my_tenant())
  with check (id = public.my_tenant());

-- profiles: read-only for the owner. Plan/tenant changes happen server-side
-- (service role), so a user can never upgrade or switch tenant themselves.
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());

-- leads: full CRUD, strictly inside the caller's tenant
create policy leads_select on public.leads
  for select to authenticated using (tenant_id = public.my_tenant());

create policy leads_insert on public.leads
  for insert to authenticated with check (tenant_id = public.my_tenant());

create policy leads_update on public.leads
  for update to authenticated
  using (tenant_id = public.my_tenant())
  with check (tenant_id = public.my_tenant());

create policy leads_delete on public.leads
  for delete to authenticated using (tenant_id = public.my_tenant());

-- anon role gets nothing
revoke all on public.tenants, public.profiles, public.leads from anon;
