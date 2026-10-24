-- ============================================================================
-- RoofFlow AI — database migration
-- ----------------------------------------------------------------------------
-- SAFE TO RE-RUN. Every statement is idempotent, and nothing is dropped: the
-- `leads` table already exists in this project with columns from an earlier
-- app, so this migration ONLY adds what RoofFlow needs and leaves everything
-- else (users, messages, followups, inspection_requests, contact_optouts)
-- untouched.
--
-- HOW TO APPLY (owner, ~1 minute):
--   1. Open the Supabase project → SQL Editor → New query.
--   2. Paste this whole file and press Run.
--   3. It prints a one-row "roofflow_migration_ok" summary at the end.
-- Until it is applied, the app runs but says "storage unavailable" instead of
-- pretending leads were saved.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. leads — the widget's lead rows
-- ---------------------------------------------------------------------------
-- Existing columns kept as-is: id, session_id, name, phone, email, zip,
-- roof_issue, note, contact_key, status, updated_at.
-- Added below: the fields the widget captures (ZIP, need, consent record,
-- transcript, score, source, user agent) plus created_at for ordering.
alter table if exists public.leads
  add column if not exists zip_code      text,
  add column if not exists roofing_need  text,
  add column if not exists consent       boolean,
  add column if not exists consent_text  text,
  add column if not exists conversation  jsonb,
  add column if not exists lead_score    integer,
  add column if not exists source        text,
  add column if not exists user_agent    text,
  add column if not exists created_at    timestamptz not null default now();

-- 1b. Legacy NOT NULL constraints on the shared `leads` table
-- The earlier app that created this table requires `session_id`. Our inserts
-- satisfy it with their own per-thread id, so the widget works either way; this
-- relaxes the constraint so the column stops being a trap for future writers.
-- (Safe: it only removes a restriction, it never deletes data.)
alter table if exists public.leads alter column session_id  drop not null;
alter table if exists public.leads alter column contact_key drop not null;

-- Backfill created_at for any pre-existing rows so `order by created_at` is sane.
update public.leads set created_at = coalesce(created_at, updated_at, now()) where created_at is null;

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_score_idx      on public.leads (lead_score desc);

-- ---------------------------------------------------------------------------
-- 2. profiles — one row per account; THE authoritative plan store
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  email                text,
  stripe_customer_id   text unique,
  current_plan         text not null default 'free',
  subscription_status  text not null default 'none',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  price_id             text,
  downgraded_to        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_plan_check check (current_plan in ('free', 'starter', 'pro'))
);

alter table public.profiles
  add column if not exists email                text,
  add column if not exists downgraded_to        text,
  add column if not exists created_at           timestamptz not null default now(),
  add column if not exists updated_at           timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 3. usage + usage_conversations — monthly conversation quota
-- ---------------------------------------------------------------------------
-- usage               : one cached counter per user per billing month.
-- usage_conversations : one row per COUNTED conversation. Its primary key IS
--                       (user_id, conversation_id), so the same conversation can
--                       never be counted twice even if two requests race.
create table if not exists public.usage (
  user_id            uuid not null references auth.users (id) on delete cascade,
  period_start       date not null,
  conversations_used integer not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (user_id, period_start)
);

create table if not exists public.usage_conversations (
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null,
  period_start    date not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists usage_conversations_period_idx
  on public.usage_conversations (user_id, period_start);

-- ---------------------------------------------------------------------------
-- 4. webhook_events — Stripe idempotency ledger
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  stripe_event_id text primary key,
  processed_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. New accounts get a profile automatically
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, current_plan, subscription_status)
  values (new.id, new.email, 'free', 'none')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that already exist.
insert into public.profiles (user_id, email, current_plan, subscription_status)
select u.id, u.email, 'free', 'none'
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------
-- Rule of the product: the browser may READ its own rows and nothing else.
-- Anon gets nothing at all. Every authoritative write (leads, plan changes,
-- usage counters) goes through the server with the service key, which bypasses
-- RLS by design.
alter table public.leads               enable row level security;
alter table public.profiles            enable row level security;
alter table public.usage               enable row level security;
alter table public.usage_conversations enable row level security;
alter table public.webhook_events      enable row level security;

-- profiles: a signed-in user may read their own row and nothing else. There is
-- deliberately NO update policy: every plan change is performed server-side with
-- the service key, so a user cannot promote themselves. (A policy on profiles
-- that reads profiles would also recurse in Postgres — another reason to avoid
-- letting the browser write here at all.)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);

-- usage: read-only to the owner of the rows.
drop policy if exists usage_select_own on public.usage;
create policy usage_select_own on public.usage
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists usage_conversations_select_own on public.usage_conversations;
create policy usage_conversations_select_own on public.usage_conversations
  for select to authenticated
  using (auth.uid() = user_id);

-- leads: no browser access at all. The CRM reads them through the server, and
-- the widget writes them through the server. (No policy = deny.)
-- webhook_events: server-only, never exposed.

-- ---------------------------------------------------------------------------
-- 7. Table privileges
-- ---------------------------------------------------------------------------
revoke all on public.profiles            from anon;
revoke all on public.usage               from anon;
revoke all on public.usage_conversations from anon;
revoke all on public.webhook_events      from anon;
revoke all on public.webhook_events      from authenticated;
revoke insert, update, delete on public.usage               from authenticated;
revoke insert, update, delete on public.usage_conversations from authenticated;
revoke insert, update, delete on public.leads               from anon, authenticated;

grant select on public.profiles            to authenticated;
grant select on public.usage               to authenticated;
grant select on public.usage_conversations to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Verification — the statement below is the proof to read after applying
-- ---------------------------------------------------------------------------
select
  'roofflow_migration_ok' as status,
  (select count(*) from information_schema.tables
     where table_schema = 'public'
       and table_name in ('leads', 'profiles', 'usage', 'usage_conversations', 'webhook_events')) as tables_present,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'leads'
       and column_name in ('zip_code', 'roofing_need', 'consent', 'consent_text',
                           'conversation', 'lead_score', 'source', 'user_agent', 'created_at')) as lead_columns_added,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename in ('profiles', 'usage', 'usage_conversations')) as rls_policies;
