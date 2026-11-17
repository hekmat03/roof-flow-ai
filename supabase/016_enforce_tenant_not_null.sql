-- 016_enforce_tenant_not_null.sql
-- Run AFTER 015. Back up first.

-- STEP 1: look before you change anything. Expect all zeros on a clean DB.
select 'messages' as tbl, count(*) from public.messages where tenant_id is null
union all select 'followups', count(*) from public.followups where tenant_id is null
union all select 'inspection_requests', count(*) from public.inspection_requests where tenant_id is null
union all select 'leads', count(*) from public.leads where tenant_id is null;

-- STEP 2: rows with NULL tenant_id belong to no company. Decide per table:
-- assign them to the right tenant, or delete them. Do not skip this, STEP 3 fails otherwise.

-- STEP 3: only run once STEP 1 shows zeros.
alter table public.messages            validate constraint messages_requires_tenant;
alter table public.followups           validate constraint followups_requires_tenant;
alter table public.inspection_requests validate constraint inspection_requests_requires_tenant;

alter table public.messages            alter column tenant_id set not null;
alter table public.followups           alter column tenant_id set not null;
alter table public.inspection_requests alter column tenant_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_requires_tenant') then
    alter table public.leads add constraint leads_requires_tenant check (tenant_id is not null) not valid;
  end if;
end $$;
alter table public.leads validate constraint leads_requires_tenant;
alter table public.leads alter column tenant_id set not null;
