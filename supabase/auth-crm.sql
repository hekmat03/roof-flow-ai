-- RoofFlow AI authenticated CRM, tenant isolation, calendar credentials and API limits.
-- Run once in Supabase SQL Editor. This is safe to re-run.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  tenant_id uuid references public.tenants(id) on delete cascade,
  company_settings jsonb not null default '{}'::jsonb,
  agent_prompts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists company_settings jsonb not null default '{}'::jsonb,
  add column if not exists agent_prompts jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  property_ownership text not null default 'Owner',
  status text not null default 'New Lead',
  scheduled_date text,
  calendar_event_id text,
  appointment_details jsonb,
  zip_code text,
  roof_issue text,
  agent_type text not null default 'Chatbot',
  chat_log jsonb not null default '[]'::jsonb,
  session_id text,
  contact_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists property_ownership text not null default 'Owner',
  add column if not exists scheduled_date text,
  add column if not exists calendar_event_id text,
  add column if not exists appointment_details jsonb,
  add column if not exists zip_code text,
  add column if not exists agent_type text not null default 'Chatbot',
  add column if not exists chat_log jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Earlier demo/API schemas required these anonymous-session fields. Authenticated
-- tenant leads use tenant_id instead.
alter table public.leads alter column session_id drop not null;
alter table public.leads alter column contact_key drop not null;

create index if not exists leads_tenant_created_idx
  on public.leads (tenant_id, created_at desc);
create index if not exists leads_tenant_status_idx
  on public.leads (tenant_id, status);

create table if not exists public.calendar_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  contractor_email text not null,
  encrypted_refresh_token text not null,
  connected_at timestamptz not null default now()
);

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  requests integer not null default 0
);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where user_id = auth.uid()
$$;

revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

create or replace function public.handle_new_roofflow_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  insert into public.tenants(name)
    values (coalesce(nullif(new.email, ''), 'RoofFlow workspace'))
    returning id into new_tenant_id;

  insert into public.profiles(user_id, email, tenant_id)
    values (new.id, new.email, new_tenant_id)
    on conflict (user_id) do update
      set email = excluded.email,
          tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id);
  return new;
end;
$$;

-- Replace any earlier demo trigger so each new account receives exactly one tenant.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_roofflow_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_roofflow_user();

-- Existing accounts receive their own isolated tenant; existing anonymous leads
-- stay unassigned and are not exposed to any contractor.
do $$
declare
  old_profile record;
  new_tenant_id uuid;
begin
  for old_profile in
    select user_id, email from public.profiles where tenant_id is null
  loop
    insert into public.tenants(name)
      values (coalesce(nullif(old_profile.email, ''), 'RoofFlow workspace'))
      returning id into new_tenant_id;
    update public.profiles set tenant_id = new_tenant_id where user_id = old_profile.user_id;
  end loop;
end;
$$;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.api_rate_limits enable row level security;

drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists leads_select_own_tenant on public.leads;
create policy leads_select_own_tenant on public.leads
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists leads_insert_own_tenant on public.leads;
create policy leads_insert_own_tenant on public.leads
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

drop policy if exists leads_update_own_tenant on public.leads;
create policy leads_update_own_tenant on public.leads
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists leads_delete_own_tenant on public.leads;
create policy leads_delete_own_tenant on public.leads
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

-- Never expose refresh tokens or rate-limit records to browser sessions.
revoke all on public.calendar_connections from anon, authenticated;
revoke all on public.api_rate_limits from anon, authenticated;

-- Keep billing fields server-managed. Authenticated users can only update the
-- two workspace JSON columns, not tenant ownership or any legacy plan fields.
revoke update on public.profiles from authenticated;
grant update (company_settings, agent_prompts) on public.profiles to authenticated;
grant select on public.profiles, public.tenants to authenticated;
grant select, insert, update, delete on public.leads to authenticated;

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_requests integer;
begin
  insert into public.api_rate_limits(bucket_key, window_started_at, requests)
    values (p_bucket_key, clock_timestamp(), 1)
    on conflict (bucket_key) do update
      set window_started_at = case
        when public.api_rate_limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          then clock_timestamp()
        else public.api_rate_limits.window_started_at
      end,
      requests = case
        when public.api_rate_limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          then 1
        else public.api_rate_limits.requests + 1
      end
      where public.api_rate_limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
         or public.api_rate_limits.requests < p_limit
    returning requests into current_requests;

  return coalesce(current_requests <= p_limit, false);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
