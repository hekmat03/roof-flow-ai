-- RoofFlow AI — email follow-ups. Apply after 007 and both existing 008 migrations.
-- Idempotent. This file is not run by the application or during build.

alter table public.contractor_profiles
  add column if not exists business_address text;

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null default 'email' check (channel = 'email'),
  to_email text not null,
  subject text not null,
  body text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  idempotency_key text not null unique,
  sequence_key text,
  step integer,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  claimed_at timestamptz,
  provider_id text,
  constraint scheduled_messages_step_check check (step is null or step in (1,3,7))
);

create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages(status, send_at);
create index if not exists scheduled_messages_tenant_idx
  on public.scheduled_messages(tenant_id, created_at desc);
create index if not exists scheduled_messages_tenant_recipient_idx
  on public.scheduled_messages(tenant_id, lower(to_email), status);

create table if not exists public.email_suppressions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('unsubscribe','do_not_contact','bounce')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, email),
  constraint email_suppressions_lowercase check (email = lower(email))
);

create table if not exists public.email_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  usage_day date not null,
  monthly_count integer not null default 0 check (monthly_count >= 0),
  daily_count integer not null default 0 check (daily_count >= 0),
  primary key (tenant_id, usage_day)
);
create index if not exists email_usage_month_idx on public.email_usage(tenant_id, period_start);

alter table public.scheduled_messages enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.email_usage enable row level security;

drop policy if exists scheduled_messages_own_select on public.scheduled_messages;
drop policy if exists scheduled_messages_own_insert on public.scheduled_messages;
drop policy if exists scheduled_messages_own_update on public.scheduled_messages;
create policy scheduled_messages_own_select on public.scheduled_messages
  for select to authenticated using (tenant_id = public.my_tenant());
create policy scheduled_messages_own_insert on public.scheduled_messages
  for insert to authenticated with check (
    tenant_id = public.my_tenant() and status = 'pending' and channel = 'email'
    and exists (select 1 from public.leads l where l.id = lead_id and l.tenant_id = public.my_tenant()
      and l.consent is true and lower(l.email) = lower(to_email)
      and l.conversation::text ilike '%' || lower(to_email) || '%')
  );
create policy scheduled_messages_own_update on public.scheduled_messages
  for update to authenticated using (tenant_id = public.my_tenant() and status = 'pending')
  with check (tenant_id = public.my_tenant() and status = 'cancelled');

drop policy if exists email_suppressions_own_select on public.email_suppressions;
drop policy if exists email_suppressions_own_insert on public.email_suppressions;
create policy email_suppressions_own_select on public.email_suppressions
  for select to authenticated using (tenant_id = public.my_tenant());
create policy email_suppressions_own_insert on public.email_suppressions
  for insert to authenticated with check (tenant_id = public.my_tenant());

-- Usage counters are server-only. The worker reserves a slot atomically before
-- sending and releases it on a failed provider attempt.
revoke all on public.email_usage from public, anon, authenticated;
revoke all on public.scheduled_messages, public.email_suppressions from anon;
grant select, insert, update on public.scheduled_messages to authenticated;
grant select, insert on public.email_suppressions to authenticated;
grant select, insert, update, delete on public.scheduled_messages, public.email_suppressions to service_role;
grant select, insert, update, delete on public.email_usage to service_role;

create or replace function public.claim_due_scheduled_messages(p_limit integer default 25)
returns setof public.scheduled_messages
language plpgsql security definer set search_path = public
as $$
begin
  update public.scheduled_messages
     set status = 'failed', last_error = 'Worker lease expired; send outcome requires review.'
   where status = 'sending' and claimed_at < now() - interval '20 minutes'
     and (attempts >= 3 or claimed_at < now() - interval '24 hours');
  return query
  with due as (
    select id from public.scheduled_messages
     where (status = 'pending' and send_at <= now())
        or (status = 'sending' and claimed_at < now() - interval '20 minutes'
            and claimed_at >= now() - interval '24 hours' and attempts < 3)
     order by send_at
     for update skip locked
     limit greatest(1, least(p_limit, 100))
  )
  update public.scheduled_messages m
     set status = 'sending', attempts = m.attempts + 1, claimed_at = now()
    from due where m.id = due.id
  returning m.*;
end
$$;

create or replace function public.reserve_email_usage(
  p_tenant uuid, p_monthly_cap integer, p_daily_cap integer
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_monthly integer; v_daily integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || ':email', 0));
  select coalesce(sum(monthly_count), 0) into v_monthly
    from public.email_usage where tenant_id = p_tenant and period_start = v_month;
  select coalesce(daily_count, 0) into v_daily
    from public.email_usage where tenant_id = p_tenant and usage_day = v_day;
  if v_monthly >= p_monthly_cap or coalesce(v_daily, 0) >= p_daily_cap then return false; end if;
  insert into public.email_usage(tenant_id, period_start, usage_day, monthly_count, daily_count)
  values (p_tenant, v_month, v_day, 1, 1)
  on conflict (tenant_id, usage_day) do update
    set monthly_count = public.email_usage.monthly_count + 1,
        daily_count = public.email_usage.daily_count + 1;
  return true;
end
$$;

create or replace function public.release_email_usage(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  update public.email_usage
     set monthly_count = greatest(0, monthly_count - 1), daily_count = greatest(0, daily_count - 1)
   where tenant_id = p_tenant and usage_day = (now() at time zone 'utc')::date
$$;

create or replace function public.unsubscribe_email(p_tenant uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_suppressions(tenant_id, email, reason)
  values (p_tenant, lower(trim(p_email)), 'unsubscribe')
  on conflict (tenant_id, email) do update set reason = 'unsubscribe';
  update public.scheduled_messages set status = 'cancelled', last_error = 'recipient unsubscribed'
   where tenant_id = p_tenant and lower(to_email) = lower(trim(p_email)) and status = 'pending';
end
$$;

revoke all on function public.claim_due_scheduled_messages(integer) from public, anon, authenticated;
revoke all on function public.reserve_email_usage(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.release_email_usage(uuid) from public, anon, authenticated;
revoke all on function public.unsubscribe_email(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_messages(integer) to service_role;
grant execute on function public.reserve_email_usage(uuid, integer, integer) to service_role;
grant execute on function public.release_email_usage(uuid) to service_role;
grant execute on function public.unsubscribe_email(uuid, text) to service_role;
