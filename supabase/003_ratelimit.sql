-- Shared rate-limit buckets for serverless API routes.
-- Run this migration in the Supabase SQL Editor.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;

-- No client-side access. Only trusted server-side service-role code should
-- read or modify these buckets.
revoke all on table public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_start timestamptz;
begin
  insert into public.rate_limit_buckets (key, count, window_start, updated_at)
  values (p_key, 1, now(), now())
  on conflict (key) do update
  set
    count = case
      when public.rate_limit_buckets.window_start
        + make_interval(secs => p_window_seconds) <= now()
      then 1
      else public.rate_limit_buckets.count + 1
    end,
    window_start = case
      when public.rate_limit_buckets.window_start
        + make_interval(secs => p_window_seconds) <= now()
      then now()
      else public.rate_limit_buckets.window_start
    end,
    updated_at = now()
  returning public.rate_limit_buckets.count,
            public.rate_limit_buckets.window_start
  into v_count, v_start;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from anon, authenticated;
