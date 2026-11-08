-- ============================================================================
-- RoofFlow AI — 008: durable spend limits for the public AI endpoints
-- Safe to re-run. Run in Supabase -> SQL Editor AFTER 003_ratelimit.sql.
--
-- Why: the server code calls a database function named `hit_rate_limit`, but
-- 003_ratelimit.sql only creates `consume_rate_limit`. Without this wrapper the
-- "database" limiter silently falls back to per-instance memory, which resets on
-- every restart and is not shared between servers. This adds the missing
-- function (only if it does not already exist) so the limits are durable.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hit_rate_limit'
  ) then
    execute $f$
      create function public.hit_rate_limit(
        p_key text,
        p_limit integer,
        p_window_seconds integer
      )
      returns boolean
      language sql
      security definer
      set search_path = ''
      as $body$
        select allowed from public.consume_rate_limit(p_key, p_limit, p_window_seconds) limit 1
      $body$
    $f$;
  end if;
end $$;

-- Only the server (service role) may call it. Never the browser.
do $$ begin
  revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
  grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
exception when undefined_function then null; end $$;

-- ============================================================================
-- Verification (read-only)
--   select proname from pg_proc where proname in ('hit_rate_limit','consume_rate_limit');  -- expect both
--   select public.hit_rate_limit('selftest', 5, 60);                                       -- expect true
--
-- Housekeeping (optional, run now and then): old daily buckets pile up.
--   delete from public.rate_limit_buckets where updated_at < now() - interval '2 days';
-- ============================================================================
