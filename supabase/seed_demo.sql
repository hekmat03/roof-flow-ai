-- seed_demo.sql — OPTIONAL. DEMO / DEVELOPMENT ONLY. NEVER run this on production.
--
-- Creates two sample companies, "ABC Roofing" (Dallas) and "XYZ Roofing" (Fort Worth),
-- so you can try the multi-company switcher and test that one company cannot see
-- another's leads. These rows used to be created by 011_crm_purchase_history_and_isolation.sql.
--
-- Run AFTER 011. Safe to re-run (it only touches these two rows). Deletes nothing.
--
-- WARNING: the widget keys below are written in a public repository, so anyone can post
-- leads into these two companies. That is acceptable for a throwaway demo database only.

insert into public.tenants (id, name, settings, widget_key)
values
  ('11111111-aaaa-4111-8111-111111111111', 'ABC Roofing',
   '{"companyName": "ABC Roofing", "city": "Dallas", "agentTone": "Professional"}'::jsonb,
   'wk_abcroofing00000000000000000001'),
  ('22222222-bbbb-4222-8222-222222222222', 'XYZ Roofing',
   '{"companyName": "XYZ Roofing", "city": "Fort Worth", "agentTone": "Friendly"}'::jsonb,
   'wk_xyzroofing00000000000000000002')
on conflict (id) do update set
  name = excluded.name,
  settings = excluded.settings;

-- To give a user access to these demo companies (replace the UUID with their auth.users id):
-- insert into public.organization_memberships (tenant_id, user_id, role)
-- values
--   ('11111111-aaaa-4111-8111-111111111111', 'user-uuid-here', 'owner'),
--   ('22222222-bbbb-4222-8222-222222222222', 'user-uuid-here', 'admin')
-- on conflict (tenant_id, user_id) do update set role = excluded.role;
