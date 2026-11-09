-- ============================================================================
-- RoofFlow AI — 011: CRM customer fields, purchase history, and multi-company RLS
-- Safe to re-run. Run in Supabase -> SQL Editor.
--
-- What this does:
--   1. Adds customer_status and purchase_history to public.leads.
--   2. Creates public.purchase_history table for relational integrity and auditing.
--   3. Creates public.organization_memberships table for multi-company access.
--   4. Seeds initial companies: ABC Roofing and XYZ Roofing.
--   5. Creates strict RLS policies for SELECT, INSERT, UPDATE, DELETE to prevent
--      any cross-company data access (ABC Roofing vs XYZ Roofing isolation).
--   6. Enforces administrative privilege checks for organization membership mutations.
-- ============================================================================

-- 1. Ensure columns exist on public.leads
alter table public.leads
  add column if not exists customer_status text default 'Lead',
  add column if not exists purchase_history jsonb not null default '[]'::jsonb;

-- 2. Organization Memberships table (multi-company support)
create table if not exists public.organization_memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists org_memberships_user_idx on public.organization_memberships (user_id);
create index if not exists org_memberships_tenant_idx on public.organization_memberships (tenant_id);

-- 3. Purchase History table
create table if not exists public.purchase_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  lead_id        uuid references public.leads (id) on delete cascade,
  item           text not null,
  amount         numeric(10, 2) not null check (amount >= 0),
  status         text not null default 'Paid' check (status in ('Paid', 'Pending', 'Refunded')),
  date           date not null default current_date,
  invoice_number text,
  created_at     timestamptz not null default now()
);

create index if not exists purchase_history_tenant_idx on public.purchase_history (tenant_id);
create index if not exists purchase_history_lead_idx   on public.purchase_history (lead_id);
create index if not exists purchase_history_tenant_created_idx on public.purchase_history (tenant_id, created_at desc);

-- 4. Seed ABC Roofing and XYZ Roofing tenants
insert into public.tenants (id, name, settings, widget_key)
values
  ('11111111-aaaa-4111-8111-111111111111', 'ABC Roofing', '{"companyName": "ABC Roofing", "city": "Dallas", "agentTone": "Professional"}'::jsonb, 'wk_abcroofing00000000000000000001'),
  ('22222222-bbbb-4222-8222-222222222222', 'XYZ Roofing', '{"companyName": "XYZ Roofing", "city": "Fort Worth", "agentTone": "Friendly"}'::jsonb, 'wk_xyzroofing00000000000000000002')
on conflict (id) do update set
  name = excluded.name,
  settings = excluded.settings;

-- 5. Helper functions: verify caller tenant access and administrative privileges
create or replace function public.user_has_tenant(tid uuid)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles where user_id = auth.uid() and tenant_id = tid
    union
    select 1 from public.organization_memberships where user_id = auth.uid() and tenant_id = tid
  );
$$;

create or replace function public.user_is_org_admin(tid uuid)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles where user_id = auth.uid() and tenant_id = tid
    union
    select 1 from public.organization_memberships where user_id = auth.uid() and tenant_id = tid and role in ('owner', 'admin')
  );
$$;

grant execute on function public.user_has_tenant(uuid) to authenticated, service_role;
grant execute on function public.user_is_org_admin(uuid) to authenticated, service_role;
revoke execute on function public.user_has_tenant(uuid) from anon, public;
revoke execute on function public.user_is_org_admin(uuid) from anon, public;

-- 6. Enable Row Level Security
alter table public.tenants                  enable row level security;
alter table public.profiles                 enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.leads                    enable row level security;
alter table public.purchase_history         enable row level security;

-- 7. Drop existing policies to cleanly replace with multi-company rules
drop policy if exists tenants_select on public.tenants;
drop policy if exists tenants_update on public.tenants;
drop policy if exists tenants_own on public.tenants;

drop policy if exists profiles_select_own on public.profiles;

drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;

drop policy if exists purchase_select on public.purchase_history;
drop policy if exists purchase_insert on public.purchase_history;
drop policy if exists purchase_update on public.purchase_history;
drop policy if exists purchase_delete on public.purchase_history;

drop policy if exists org_mem_select on public.organization_memberships;
drop policy if exists org_mem_insert on public.organization_memberships;
drop policy if exists org_mem_update on public.organization_memberships;
drop policy if exists org_mem_delete on public.organization_memberships;

-- 8. PROFILES policy: Read-only for account owner
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

-- 9. TENANTS policies: Only members can read or update their tenant
create policy tenants_select on public.tenants
  for select to authenticated
  using (public.user_has_tenant(id));

create policy tenants_update on public.tenants
  for update to authenticated
  using (public.user_is_org_admin(id))
  with check (public.user_is_org_admin(id));

-- 10. LEADS policies: Full CRUD strictly scoped to the caller's tenant
create policy leads_select on public.leads
  for select to authenticated
  using (public.user_has_tenant(tenant_id));

create policy leads_insert on public.leads
  for insert to authenticated
  with check (public.user_has_tenant(tenant_id));

create policy leads_update on public.leads
  for update to authenticated
  using (public.user_has_tenant(tenant_id))
  with check (public.user_has_tenant(tenant_id));

create policy leads_delete on public.leads
  for delete to authenticated
  using (public.user_has_tenant(tenant_id));

-- 11. PURCHASE HISTORY policies: Full CRUD strictly scoped to the caller's tenant
create policy purchase_select on public.purchase_history
  for select to authenticated
  using (public.user_has_tenant(tenant_id));

create policy purchase_insert on public.purchase_history
  for insert to authenticated
  with check (public.user_has_tenant(tenant_id));

create policy purchase_update on public.purchase_history
  for update to authenticated
  using (public.user_has_tenant(tenant_id))
  with check (public.user_has_tenant(tenant_id));

create policy purchase_delete on public.purchase_history
  for delete to authenticated
  using (public.user_has_tenant(tenant_id));

-- 12. ORGANIZATION MEMBERSHIPS policies: Viewable by self or org members; managed only by admins
create policy org_mem_select on public.organization_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.user_has_tenant(tenant_id));

create policy org_mem_insert on public.organization_memberships
  for insert to authenticated
  with check (public.user_is_org_admin(tenant_id));

create policy org_mem_update on public.organization_memberships
  for update to authenticated
  using (public.user_is_org_admin(tenant_id))
  with check (public.user_is_org_admin(tenant_id));

create policy org_mem_delete on public.organization_memberships
  for delete to authenticated
  using (public.user_is_org_admin(tenant_id));

-- 13. Revoke permissions from anon to safeguard private customer data
revoke all on public.tenants, public.profiles, public.leads,
               public.purchase_history, public.organization_memberships from anon;
