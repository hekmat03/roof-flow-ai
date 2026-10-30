-- ============================================================================
-- RoofFlow AI — Step 3: Lemon Squeezy billing + chat usage limits
-- Safe to re-run. Run in Supabase -> SQL Editor AFTER 001_multitenant.sql.
-- ============================================================================

-- 1. Subscription fields on profiles (written ONLY by the webhook, service role)
alter table public.profiles
  add column if not exists ls_customer_id       text,
  add column if not exists ls_subscription_id   text,
  add column if not exists ls_variant_id        text,
  add column if not exists current_period_end   timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists ls_portal_url        text,
  add column if not exists ls_updated_at        timestamptz;

-- 2. One row per counted conversation (chat thread)
create table if not exists public.usage_conversations (
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null,
  period_start    date not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.usage_conversations
  add column if not exists message_count integer not null default 0;

create index if not exists usage_conversations_period_idx
  on public.usage_conversations (user_id, period_start);

alter table public.usage_conversations enable row level security;

-- No policies on purpose: browsers can never read or write usage. Only the
-- server (service role) can.

-- 3. Atomic "may this user send a chat message?" check + count.
--    - same conversation_id -> not counted again (but capped per conversation,
--      so one id cannot be reused forever to dodge the monthly limit)
--    - new conversation_id -> counted, rejected when the monthly limit is hit
create or replace function public.consume_chat(
  p_user uuid,
  p_conversation text,
  p_limit integer,
  p_max_messages integer default 60
)
returns table (allowed boolean, used integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_used   integer;
  v_msgs   integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select count(*) into v_used
    from public.usage_conversations
   where user_id = p_user and period_start = v_period;

  select message_count into v_msgs
    from public.usage_conversations
   where user_id = p_user and conversation_id = p_conversation;

  if found then
    if v_msgs >= p_max_messages then
      return query select false, v_used, 'conversation_cap'::text;
      return;
    end if;

    update public.usage_conversations
       set message_count = message_count + 1
     where user_id = p_user and conversation_id = p_conversation;

    return query select true, v_used, null::text;
    return;
  end if;

  if v_used >= p_limit then
    return query select false, v_used, 'limit'::text;
    return;
  end if;

  insert into public.usage_conversations (
    user_id, conversation_id, period_start, message_count
  )
  values (p_user, p_conversation, v_period, 1);

  return query select true, v_used + 1, null::text;
end
$$;

revoke all on function public.consume_chat(uuid, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.consume_chat(uuid, text, integer, integer)
  to service_role;
