
-- supabase/tenants.sql — multi-tenancy + RLS
-- Run in the Supabase SQL Editor.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id);

alter table public.leads
  add column if not exists tenant_id uuid references public.tenants(id);

create index if not exists leads_tenant_idx
  on public.leads (tenant_id);

create or replace function public.my_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where user_id = auth.uid()
$$;

-- Automatically create a tenant for every new signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid;
begin
  insert into tenants(name)
  values (coalesce(new.email, 'New contractor'))
  returning id into t;

  insert into profiles(user_id, email, tenant_id)
  values (new.id, new.email, t)
  on conflict (user_id)
  do update set tenant_id = excluded.tenant_id;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.tenants enable row level security;
alter table public.leads enable row level security;

create policy tenants_own
  on public.tenants
  for select
  using (id = public.my_tenant());

create policy leads_select
  on public.leads
  for select
  using (tenant_id = public.my_tenant());

create policy leads_insert
  on public.leads
  for insert
  with check (tenant_id = public.my_tenant());

create policy leads_update
  on public.leads
  for update
  using (tenant_id = public.my_tenant());

create policy leads_delete
  on public.leads
  for delete
  using (tenant_id = public.my_tenant());

alter table public.profiles
  add column if not exists ls_customer_id text;
-- Lemon Squeezy (replaces stripe_customer_id).
