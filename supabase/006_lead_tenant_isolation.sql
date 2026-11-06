-- ============================================================================
-- RoofFlow AI — 006: lead privacy + account isolation
-- Safe to re-run. Run in Supabase -> SQL Editor AFTER 001_multitenant.sql.
--
-- What this does
--   1. Gives every tenant (roofing company) a public `widget_key`. The embeddable
--      widget sends it so the server can attach the right tenant_id to a lead.
--      It is an IDENTIFIER, not a secret: it can only ever ADD leads to that
--      company's own CRM, never read anything.
--   2. Makes sure the columns the widget insert uses exist on public.leads.
--   3. Refuses (at the database level) any NEW widget lead without a tenant, so
--      a future code bug cannot silently create an unowned/visible-to-nobody row.
--
-- Legacy rows (tenant_id IS NULL) are left untouched. With the new server code
-- they are visible to NOBODY. See the clean-up queries at the bottom.
-- ============================================================================

-- 1. tenants.widget_key -------------------------------------------------------
alter table public.tenants
  add column if not exists widget_key text;

-- Backfill existing tenants. 'wk_' + 32 hex chars (two UUIDs' worth of randomness
-- is more than enough; the server validates this exact shape).
update public.tenants
   set widget_key = 'wk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 32)
 where widget_key is null;

alter table public.tenants
  alter column widget_key set default
    ('wk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 32)),
  alter column widget_key set not null;

create unique index if not exists tenants_widget_key_uidx
  on public.tenants (widget_key);

-- 2. Columns the widget insert writes (no-ops if migration.sql already added them)
alter table public.leads
  add column if not exists tenant_id    uuid references public.tenants (id) on delete cascade,
  add column if not exists roofing_need text,
  add column if not exists consent      boolean,
  add column if not exists consent_text text,
  add column if not exists lead_score   integer,
  add column if not exists source       text,
  add column if not exists user_agent   text;

create index if not exists leads_tenant_created_idx
  on public.leads (tenant_id, created_at desc);

-- 3. New widget leads MUST belong to a tenant.
--    NOT VALID = enforced for new/updated rows, existing legacy rows are not
--    re-checked (so this cannot fail on old data).
do $$ begin
  alter table public.leads
    add constraint leads_widget_requires_tenant
    check (source is distinct from 'Website Widget' or tenant_id is not null)
    not valid;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Verification (read-only). Run these after the migration.
-- ============================================================================
-- Every tenant has a key:
--   select count(*) filter (where widget_key is null) as missing_keys from public.tenants;   -- expect 0
-- Legacy rows nobody can see any more:
--   select count(*) as orphaned_leads from public.leads where tenant_id is null;
-- Look up your own embed key:
--   select name, widget_key from public.tenants order by created_at;

-- ============================================================================
-- Clean-up of legacy rows (OPTIONAL, run by hand, ONE company at a time).
-- Rows captured before this fix have no owner, so only YOU can decide whose
-- they are. Example: hand all orphaned widget leads to one tenant:
--
--   update public.leads
--      set tenant_id = '<tenant uuid>'
--    where tenant_id is null and source = 'Website Widget';
--
-- Do NOT bulk-assign if more than one company's widget was live — you would
-- recreate exactly the cross-company exposure this migration removes.
-- ============================================================================
