-- 013_tenant_column_guard.sql — signed-in users may edit their company's name, settings and prompts,
-- but never the tenant's identity columns. Without this, the tenants_update policy (001/011) lets any
-- signed-in user overwrite widget_key, which silently breaks their embedded widget (or points it at a
-- guessable value). Run AFTER 012_email_verification.sql. Safe to re-run. Deletes no data.
--
-- Only API callers acting as 'authenticated' or 'anon' are restricted. service_role (our serverless
-- functions) and the Supabase SQL editor are unaffected, so you can still rotate a key by hand:
--   update public.tenants
--      set widget_key = 'wk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 32)
--    where id = '<tenant uuid>';

create or replace function public.tenants_guard_protected_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.widget_key is distinct from old.widget_key
       or new.created_at is distinct from old.created_at then
      raise exception 'tenants.id, widget_key and created_at cannot be changed from the client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tenants_guard_protected_columns on public.tenants;
create trigger tenants_guard_protected_columns
  before update on public.tenants
  for each row execute function public.tenants_guard_protected_columns();

-- Manual verification (run in the SQL editor after applying; expect the first to fail, the second to work):
--   set local role authenticated;
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--   update public.tenants set widget_key = 'wk_hacked' where id = public.my_tenant();   -- ERROR 42501
--   update public.tenants set name = name where id = public.my_tenant();                -- OK
