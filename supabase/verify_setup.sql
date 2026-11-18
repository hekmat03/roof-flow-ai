-- verify_setup.sql — READ-ONLY. Changes nothing.
-- Run in Supabase -> SQL Editor AFTER applying the migrations in MIGRATIONS.md.
-- Every row must show ok = true. Failures sort to the top. (The SQL Editor shows only
-- the last statement's result, so this file is a single query on purpose.)

select check_name, ok from (
  select 'table exists: ' || t as check_name, to_regclass('public.' || t) is not null as ok
  from unnest(array[
    'leads','messages','followups','inspection_requests','contact_optouts',
    'tenants','profiles','usage_conversations','rate_limit_buckets',
    'calendar_connections','contractor_profiles','scheduled_messages',
    'email_suppressions','email_usage','purchase_history',
    'organization_memberships','team_invites'
  ]) as t

  union all
  select 'row level security on: ' || t,
         coalesce((select c.relrowsecurity from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t), false)
  from unnest(array[
    'leads','messages','followups','inspection_requests','contact_optouts',
    'tenants','profiles','usage_conversations','rate_limit_buckets',
    'calendar_connections','contractor_profiles','scheduled_messages',
    'email_suppressions','email_usage','purchase_history',
    'organization_memberships','team_invites'
  ]) as t

  union all
  select 'function exists: ' || f,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = f)
  from unnest(array[
    'my_tenant','handle_new_user','consume_chat','consume_rate_limit','hit_rate_limit',
    'claim_due_scheduled_messages','reserve_email_usage','release_email_usage',
    'unsubscribe_email','user_has_tenant','user_is_org_admin',
    'leads_guard_email_verified','tenants_guard_protected_columns'
  ]) as f

  union all
  select 'trigger exists: ' || g,
         exists (select 1 from pg_trigger where tgname = g and not tgisinternal)
  from unnest(array[
    'on_auth_user_created','leads_guard_email_verified','tenants_guard_protected_columns'
  ]) as g

  union all
  select 'column exists: ' || tc,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = split_part(tc, '.', 1)
                   and column_name = split_part(tc, '.', 2))
  from unnest(array[
    'tenants.widget_key','tenants.settings','tenants.prompts',
    'leads.tenant_id','leads.consent','leads.customer_status','leads.purchase_history',
    'leads.email_verified_at','messages.tenant_id','followups.tenant_id',
    'inspection_requests.tenant_id','contact_optouts.tenant_id',
    'profiles.tenant_id','profiles.role','profiles.disabled','profiles.ls_subscription_id',
    'contractor_profiles.business_address',
    'calendar_connections.owner_id','calendar_connections.encrypted_refresh_token'
  ]) as tc

  union all
  select 'follow-up days 1/2/4/7 allowed (010)',
         exists (select 1 from pg_constraint
                 where conname = 'scheduled_messages_step_check'
                   and pg_get_constraintdef(oid) like '%4%')

  union all
  select 'service role may call consume_rate_limit (008)',
         has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE')

  union all
  -- Informational row (always true). On a production database the number should be 0.
  select 'info: demo companies present = ' ||
         (select count(*) from public.tenants
           where id in ('11111111-aaaa-4111-8111-111111111111',
                        '22222222-bbbb-4222-8222-222222222222'))::text,
         true
) checks
order by ok, check_name;
