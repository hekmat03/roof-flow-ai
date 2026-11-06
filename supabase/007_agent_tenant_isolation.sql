-- ============================================================================
-- RoofFlow AI — 007: tenant ownership for chatbot/agent data + per-company opt-outs
-- Safe to re-run. Run in Supabase -> SQL Editor AFTER 001_multitenant.sql
-- (and after 006_lead_tenant_isolation.sql).
--
-- What this does
--   1. Adds tenant_id to every table the agent tools write to, so each row
--      belongs to exactly one roofing company.
--   2. Makes tenant_id REQUIRED for every NEW row in the three agent-only
--      tables (a code bug can no longer create an unowned row).
--   3. Turns the "do not contact" list into a per-company list. Opt-outs
--      recorded BEFORE this migration have no company; they are KEPT and still
--      honoured for everyone (safe default: over-blocking beats contacting
--      someone who asked to stop).
-- ============================================================================

-- 1. tenant_id on the agent tables ------------------------------------------
-- (public.leads already has tenant_id from 001_multitenant.sql)
alter table public.inspection_requests
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.messages
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.followups
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.contact_optouts
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

create index if not exists inspection_requests_tenant_idx on public.inspection_requests (tenant_id, created_at desc);
create index if not exists messages_tenant_idx            on public.messages (tenant_id, created_at desc);
create index if not exists followups_tenant_idx           on public.followups (tenant_id, due_at);

-- 2. New rows must have a tenant (NOT VALID = existing legacy rows are not re-checked)
do $$ begin
  alter table public.inspection_requests
    add constraint inspection_requests_requires_tenant check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.messages
    add constraint messages_requires_tenant check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.followups
    add constraint followups_requires_tenant check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;

-- 3. contact_optouts: one row per (company, contact) -------------------------
-- The old primary key was `contact` alone (global). Give the table its own id
-- and make (tenant_id, contact) unique instead. Legacy rows keep tenant_id NULL.
alter table public.contact_optouts
  add column if not exists id uuid default gen_random_uuid();
update public.contact_optouts set id = gen_random_uuid() where id is null;

alter table public.contact_optouts drop constraint if exists contact_optouts_pkey;
do $$ begin
  alter table public.contact_optouts add primary key (id);
exception when invalid_table_definition then null; end $$;

create unique index if not exists contact_optouts_tenant_contact_uidx
  on public.contact_optouts (tenant_id, contact);

-- ============================================================================
-- Verification (read-only)
-- ============================================================================
--   -- legacy opt-outs that are still honoured for everyone:
--   select count(*) from public.contact_optouts where tenant_id is null;
--   -- rows written by the agent since this migration, per company:
--   select tenant_id, count(*) from public.messages group by 1;
--
-- Legacy agent rows (tenant_id IS NULL) belong to no company and show up in no
-- company's data. Assign them by hand only if you are sure whose they are.
-- ============================================================================
