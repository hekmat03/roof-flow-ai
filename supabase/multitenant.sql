-- RoofFlow AI — multi-tenant SaaS (Lemon Squeezy, RLS, tenants).
-- SAFE TO RE-RUN. Does not drop existing tables, agents, or Stripe columns.

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Roofing Company',
  owner_id uuid references auth.users (id) on delete cascade,
  current_plan text not null default 'free',
  subscription_status text not null default 'none',
  lemon_customer_id text,
  lemon_subscription_id text,
  lemon_variant_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  chats_used integer not null default 0,
  chats_period_start date not null default (date_trunc('month', timezone('utc', now())))::date,
  google_refresh_token text,
  google_calendar_email text,
  company_settings jsonb,
  prompts jsonb,
  webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_plan_check check (current_plan in ('free', 'starter', 'pro'))
);

alter table public.tenants
  add column if not exists lemon_customer_id text,
  add column if not exists lemon_subscription_id text,
  add column if not exists lemon_variant_id text,
  add column if not exists chats_used integer not null default 0,
  add column if not exists chats_period_start date not null default (date_trunc('month', timezone('utc', now())))::date,
  add column if not exists google_refresh_token text,
  add column if not exists google_calendar_email text,
  add column if not exists company_settings jsonb,
  add column if not exists prompts jsonb,
  add column if not exists webhook_url text;

create index if not exists tenants_owner_idx on public.tenants (owner_id);

-- ---------------------------------------------------------------------------
-- Profiles: link each user to one tenant (contractor A ≠ contractor B)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  email                text,
  tenant_id            uuid references public.tenants (id) on delete set null,
  current_plan         text not null default 'free',
  subscription_status  text not null default 'none',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants (id) on delete set null,
  add column if not exists lemon_customer_id text,
  add column if not exists lemon_subscription_id text;

-- ---------------------------------------------------------------------------
-- Leads: tenant isolation
-- ---------------------------------------------------------------------------
alter table if exists public.leads
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade,
  add column if not exists property_ownership text,
  add column if not exists scheduled_date text,
  add column if not exists appointment_details jsonb,
  add column if not exists agent_type text,
  add column if not exists chat_log jsonb,
  add column if not exists zip_code text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists leads_tenant_idx on public.leads (tenant_id, created_at desc);

create table if not exists public.usage_conversations (
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null,
  period_start    date not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create table if not exists public.webhook_events (
  stripe_event_id text primary key,
  processed_at    timestamptz not null default now()
);

alter table public.webhook_events
  add column if not exists lemon_event_id text;

create unique index if not exists webhook_events_lemon_idx
  on public.webhook_events (lemon_event_id)
  where lemon_event_id is not null;

-- ---------------------------------------------------------------------------
-- Signup: one tenant + profile per new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant uuid;
begin
  insert into public.tenants (name, owner_id, current_plan, subscription_status)
  values (coalesce(split_part(new.email, '@', 1), 'My Roofing Company'), new.id, 'free', 'none')
  returning id into new_tenant;

  insert into public.profiles (user_id, email, tenant_id, current_plan, subscription_status)
  values (new.id, new.email, new_tenant, 'free', 'none')
  on conflict (user_id) do update
    set email = excluded.email,
        tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tenant helper (used by RLS — never leaks across contractors)
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where user_id = auth.uid() limit 1
$$;

grant execute on function public.current_tenant_id() to authenticated;

-- Chat quota: one counted conversation per id per month. Plan limits:
-- free 20 / starter 250 / pro 1000
create or replace function public.consume_chat(p_conversation_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  plan text;
  used int;
  period date;
  lim int;
  inserted int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_conversation_id is null or length(p_conversation_id) < 8 then
    return jsonb_build_object('ok', false, 'error', 'bad_conversation');
  end if;

  select t.id, t.current_plan, t.chats_used, t.chats_period_start
    into tid, plan, used, period
  from public.tenants t
  join public.profiles p on p.tenant_id = t.id
  where p.user_id = auth.uid()
  limit 1;

  if tid is null then
    return jsonb_build_object('ok', false, 'error', 'no_tenant');
  end if;

  if period is distinct from (date_trunc('month', timezone('utc', now())))::date then
    used := 0;
    period := (date_trunc('month', timezone('utc', now())))::date;
    update public.tenants set chats_used = 0, chats_period_start = period, updated_at = now() where id = tid;
  end if;

  lim := case plan when 'pro' then 1000 when 'starter' then 250 else 20 end;

  insert into public.usage_conversations (user_id, conversation_id, period_start)
  values (auth.uid(), p_conversation_id, period)
  on conflict (user_id, conversation_id) do nothing;
  get diagnostics inserted = row_count;

  if inserted = 0 then
    return jsonb_build_object('ok', true, 'already', true, 'used', used, 'limit', lim, 'remaining', greatest(lim - used, 0), 'plan', plan);
  end if;

  if used >= lim then
    delete from public.usage_conversations
      where user_id = auth.uid() and conversation_id = p_conversation_id;
    return jsonb_build_object('ok', false, 'error', 'limit_reached', 'used', used, 'limit', lim, 'remaining', 0, 'plan', plan);
  end if;

  update public.tenants
    set chats_used = used + 1, chats_period_start = period, updated_at = now()
    where id = tid;

  return jsonb_build_object('ok', true, 'used', used + 1, 'limit', lim, 'remaining', greatest(lim - used - 1, 0), 'plan', plan);
end;
$$;

grant execute on function public.consume_chat(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.usage_conversations enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

drop policy if exists tenants_update_own on public.tenants;
create policy tenants_update_own on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists leads_select_tenant on public.leads;
create policy leads_select_tenant on public.leads
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists leads_insert_tenant on public.leads;
create policy leads_insert_tenant on public.leads
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

drop policy if exists leads_update_tenant on public.leads;
create policy leads_update_tenant on public.leads
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists leads_delete_tenant on public.leads;
create policy leads_delete_tenant on public.leads
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists usage_conversations_select_own on public.usage_conversations;
create policy usage_conversations_select_own on public.usage_conversations
  for select to authenticated
  using (auth.uid() = user_id);

-- Keep plan/billing columns honest: authenticated users cannot promote themselves.
create or replace function public.protect_tenant_billing()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.current_plan := old.current_plan;
    new.subscription_status := old.subscription_status;
    new.lemon_customer_id := old.lemon_customer_id;
    new.lemon_subscription_id := old.lemon_subscription_id;
    new.lemon_variant_id := old.lemon_variant_id;
    new.chats_used := old.chats_used;
    new.chats_period_start := old.chats_period_start;
    new.google_refresh_token := old.google_refresh_token;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tenants_protect_billing on public.tenants;
create trigger tenants_protect_billing
  before update on public.tenants
  for each row execute function public.protect_tenant_billing();

create or replace function public.protect_profile_billing()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.current_plan := old.current_plan;
    new.subscription_status := old.subscription_status;
    new.tenant_id := old.tenant_id;
    new.lemon_customer_id := old.lemon_customer_id;
    new.lemon_subscription_id := old.lemon_subscription_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_profile_billing();

revoke all on public.webhook_events from anon, authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, update on public.tenants to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.usage_conversations to authenticated;
revoke all on public.tenants from anon;
revoke all on public.profiles from anon;
revoke all on public.leads from anon;
