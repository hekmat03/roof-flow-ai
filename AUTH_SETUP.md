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
   - Redirect URLs: add `https://YOUR-DOMAIN/app` (and `http://localhost:5173/app`)
5. Supabase → SQL Editor: apply the schema and migrations in this order:
   1. `supabase/schema.sql`
   2. `supabase/001_multitenant.sql`
   3. `supabase/002_billing.sql`
   4. `supabase/003_ratelimit.sql`
   5. `supabase/004_calendar.sql`
   6. `supabase/005_onboarding.sql`
   7. `supabase/006_lead_tenant_isolation.sql`
   8. `supabase/007_agent_tenant_isolation.sql`

   The root Vite deployment's lead widget requires migration `006` for tenant
   widget keys and lead fields. Onboarding requires `005`; tenant-scoped agent
   writes require `007`. Apply these only to the intended Supabase project after
   reviewing their SQL and backing up production data. Never run them as part of
   a frontend build or deployment.
6. Optional while testing: Authentication → Providers → Email → turn off "Confirm email" so sign-up logs in instantly.

Never put the service-role key in a `VITE_` variable.
