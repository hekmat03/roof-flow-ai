-- Permit the trusted Vercel service-role client to call the shared limiter RPC.
-- Client roles remain denied; the function is SECURITY DEFINER and writes only
-- the server-side rate_limit_buckets table.
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;