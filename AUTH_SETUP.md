# Fix login / sign-up ("Authentication is not configured")

The error means the **built site has no Supabase keys**. `VITE_*` variables are baked in at build time, so they must exist *before* the build runs.

1. Supabase → Project Settings → API. Copy **Project URL** and the **anon public** key.
2. Vercel → your project → Settings → Environment Variables. Add for **Production, Preview and Development**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
   - (server only) `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MISTRAL_API_KEY`
3. Vercel → Deployments → **Redeploy** the latest one (uncheck "use existing build cache"). Env changes don't apply to old builds.
4. Supabase → Authentication → URL Configuration:
   - Site URL = `https://YOUR-DOMAIN`
   - Redirect URLs (add all of these):
     - `https://YOUR-DOMAIN/auth/callback`
     - `https://YOUR-DOMAIN/app`
     - `http://localhost:3000/auth/callback` (for local development)
     - `http://localhost:3000/app` (for local development)
5. Supabase → SQL Editor: apply the schema and migrations in this order:
   1. `supabase/schema.sql`
   2. `supabase/001_multitenant.sql`
   3. `supabase/002_billing.sql`
   4. `supabase/003_ratelimit.sql`
   5. `supabase/004_calendar.sql`
   6. `supabase/005_onboarding.sql`
   7. `supabase/006_lead_tenant_isolation.sql`
   8. `supabase/007_agent_tenant_isolation.sql`
   9. `supabase/008_rate_limit_service_role.sql`
   10. `supabase/008_spend_limits.sql`
   11. `supabase/009_followups.sql`
   12. `supabase/010_followup_schedule_days.sql`
   13. `supabase/011_crm_purchase_history_and_isolation.sql`

   Apply these to your Supabase project in the SQL Editor. Never run them as part of a frontend build or deployment.

6. **Adding organization memberships (ABC Roofing & XYZ Roofing)**:
   By default, migration 011 provisions the ABC and XYZ tenant rows. To link a contractor user to these organizations, run:
   ```sql
   -- Replace 'user-uuid-here' with the contractor's auth.users id
   insert into public.organization_memberships (tenant_id, user_id, role)
   values
     ('11111111-aaaa-4111-8111-111111111111', 'user-uuid-here', 'owner'),
     ('22222222-bbbb-4222-8222-222222222222', 'user-uuid-here', 'admin')
   on conflict (tenant_id, user_id) do update set role = excluded.role;
   ```

7. Never put the service-role key in a `VITE_` variable or client-side code.
