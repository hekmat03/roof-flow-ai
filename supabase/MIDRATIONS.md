# Database migrations — single source of truth

This is the only place that lists the SQL files and the order to run them. README, AUTH_SETUP, EMAIL_SETUP and DEPLOYMENT point here. `tests/migrations-docs.check.ts` fails if this list and the files in `supabase/` ever disagree.

**Status of this document**
- Migrations `schema.sql` and `001` to `015` were reviewed by reading every file.
- **`016` has not been reviewed yet.** Add its row (see "Adding a migration" at the bottom) before you set up a new database.
- The order below was checked by a script that reads the files (`npm test`). It has **not** yet been run on a real, empty Supabase project. Do that once (see "Fresh install") and keep the result.

## How migrations work in this project

- There is no migration tool. You paste each file into Supabase → **SQL Editor** and press Run, one file at a time, in the order below.
- The app never applies migrations, and a frontend build or deploy never touches the database.
- **Back up first** (Supabase → Database → Backups) before running anything on a database that has data.
- No file here drops a table, truncates a table, or deletes rows (the only `delete from` is inside a comment in `008_spend_limits.sql`). Several files drop and re-create policies, triggers and constraints so they can be re-run safely.

## Apply order for a fresh database

<!-- MIGRATION-ORDER:BEGIN -->
schema.sql
001_multitenant.sql
002_billing.sql
003_ratelimit.sql
004_calendar.sql
005_onboarding.sql
006_lead_tenant_isolation.sql
007_agent_tenant_isolation.sql
008_rate_limit_service_role.sql
008_spend_limits.sql
009_followups.sql
010_followup_schedule_days.sql
011_crm_purchase_history_and_isolation.sql
012_email_verification.sql
013_tenant_column_guard.sql
014_user_management.sql
015_calendar_fix.sql
<!-- MIGRATION-ORDER:END -->

| Step | File | What it does | Needs first |
|---|---|---|---|
| 0 | `schema.sql` | Base tables `leads`, `messages`, `followups`, `inspection_requests`, `contact_optouts` (RLS on, no policies). **Required before 007.** | — |
| 1 | `001_multitenant.sql` | `tenants`, `profiles`, lead columns, RLS policies, `my_tenant()`, signup trigger on `auth.users` | schema.sql |
| 2 | `002_billing.sql` | `usage_conversations`, `consume_chat()`, billing columns on `profiles` | 001 |
| 3 | `003_ratelimit.sql` | `rate_limit_buckets`, `consume_rate_limit()` | — |
| 4 | `004_calendar.sql` | `calendar_connections` | 001 |
| 5 | `005_onboarding.sql` | `contractor_profiles` (one-time company info) | — |
| 6 | `006_lead_tenant_isolation.sql` | `tenants.widget_key`, consent and source columns on `leads` | 001 |
| 7 | `007_agent_tenant_isolation.sql` | `tenant_id` on `messages`, `followups`, `inspection_requests`, `contact_optouts` | schema.sql, 001 |
| 8a | `008_rate_limit_service_role.sql` | lets the server (service role) call `consume_rate_limit()` | 003 |
| 8b | `008_spend_limits.sql` | `hit_rate_limit()` wrapper | 003 |
| 9 | `009_followups.sql` | `scheduled_messages`, `email_suppressions`, `email_usage`, `business_address`, four email functions | 001, 005, 007, both 008 |
| 10 | `010_followup_schedule_days.sql` | allows Day 1/2/4/7 (keeps old Day 3 rows valid) | 009 |
| 11 | `011_crm_purchase_history_and_isolation.sql` | `purchase_history`, `organization_memberships`, `user_has_tenant()`, `user_is_org_admin()`, stricter RLS. **No longer creates demo companies.** | 001 |
| 12 | `012_email_verification.sql` | `leads.email_verified_at` and its guard trigger | 001 |
| 13 | `013_tenant_column_guard.sql` | users cannot edit `widget_key` and other identity columns | 012 |
| 14 | `014_user_management.sql` | `profiles.role/full_name/disabled`, `team_invites`, new `my_tenant()` | 013 |
| 15 | `015_calendar_fix.sql` | corrects `calendar_connections` columns | 004 |

The two `008_` files do not depend on each other; run either first, but both before 009. `014` replaces the `my_tenant()` function created by 001, so it must stay after 001.

## Files that are NOT part of setup

| File | What it is |
|---|---|
| `migration.sql`, `tenants.sql` | **Legacy. Do not run.** Older single-purpose scripts from before `001`. They overlap `001` and `002` and are replaced by them. Kept only for history (`site-server/` still mentions `migration.sql` in a comment). |
| `seed_demo.sql` | **Optional, demo or development only.** Creates the two sample companies "ABC Roofing" and "XYZ Roofing". Never run on production. |
| `verify_setup.sql` | **Read-only check.** Run after setup; every row should say `true`. |

## Fresh install (new, empty Supabase project)

1. Create a new Supabase project. Do not use your production project for this first test.
2. Open SQL Editor and run the files in the order above, one at a time. Stop at the first error and report the file name and the error text.
3. Run `supabase/verify_setup.sql`. Every row must show `true` (the last row, `info: demo companies present`, is informational and also shows `true`).
4. Set the Vercel environment variables (see `AUTH_SETUP.md`, `EMAIL_SETUP.md`, `DEPLOYMENT.md`).
5. Optional, demo only: run `seed_demo.sql`.

If step 2 or 3 fails, the documented order is wrong: send the error and fix this file.

## Existing database: which migrations do I already have?

Read-only. Run it in SQL Editor; it changes nothing. `false` means that migration's objects are missing.

```sql
select migration, applied from (values
  ('schema.sql',  to_regclass('public.messages') is not null),
  ('001',  to_regclass('public.tenants') is not null
          and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'my_tenant')),
  ('002',  to_regclass('public.usage_conversations') is not null),
  ('003',  to_regclass('public.rate_limit_buckets') is not null),
  ('004',  to_regclass('public.calendar_connections') is not null),
  ('005',  to_regclass('public.contractor_profiles') is not null),
  ('006',  exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tenants' and column_name = 'widget_key')),
  ('007',  exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'messages' and column_name = 'tenant_id')),
  ('008a', has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE')),
  ('008b', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'hit_rate_limit')),
  ('009',  to_regclass('public.scheduled_messages') is not null),
  ('010',  exists (select 1 from pg_constraint
                   where conname = 'scheduled_messages_step_check' and pg_get_constraintdef(oid) like '%4%')),
  ('011',  to_regclass('public.purchase_history') is not null
          and to_regclass('public.organization_memberships') is not null),
  ('012',  exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'leads' and column_name = 'email_verified_at')),
  ('013',  exists (select 1 from pg_trigger where tgname = 'tenants_guard_protected_columns' and not tgisinternal)),
  ('014',  to_regclass('public.team_invites') is not null),
  ('015',  exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'calendar_connections' and column_name = 'owner_id'))
) as t(migration, applied)
order by migration;
```

Apply only the missing ones, in the order above. Never re-run a migration to "fix" something without reading it first.

## Demo companies (ABC Roofing, XYZ Roofing)

- `011` used to create these two companies, with fixed IDs and fixed widget keys that are visible in this public repository. It no longer does; the same rows now live in `seed_demo.sql` (optional).
- The live app does not need them. Signed-in users load their own company from the database. The built-in ABC/XYZ data in the frontend is only used in demo mode, when Supabase is not configured at all.
- **If your existing database already ran the old `011`,** the two rows are still there. Nothing here deletes them. To see them and whether they hold any data (read-only):

```sql
select t.id, t.name, t.widget_key,
       (select count(*) from public.leads l where l.tenant_id = t.id) as leads
from public.tenants t
where t.id in ('11111111-aaaa-4111-8111-111111111111',
               '22222222-bbbb-4222-8222-222222222222');
```

- Optional, **manual, review first, off by default:** because their widget keys are public, anyone could post a fake lead into those two companies. If you keep the rows and want to close that, rotate their keys. Uncomment only after checking the result above and taking a backup:

```sql
-- update public.tenants
--    set widget_key = 'wk_' || encode(gen_random_bytes(16), 'hex')
--  where id in ('11111111-aaaa-4111-8111-111111111111',
--               '22222222-bbbb-4222-8222-222222222222');
```

## Adding a migration

1. Use the next number, for example `017_something.sql`. Start the file with a comment: what it does, what it needs first, and whether it is safe to re-run.
2. Add its file name to the order block above and a row to the table.
3. Run `npm test`. `tests/migrations-docs.check.ts` fails if the list and the files disagree or if a file uses a table that is created later.
4. Do not edit a migration that has already been applied anywhere; add a new one instead.

**Row still missing: `016`.** Open `supabase/016_*.sql`, read its header comment, and add its file name to the order block and its row to the table, after `015`.
