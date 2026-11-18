# Fix login / sign-up ("Authentication is not configured")

The error means the **built site has no Supabase keys**. `VITE_*` variables are baked in at build time, so they must exist *before* the build runs.

1. Supabase → Project Settings → API. Copy **Project URL** and the **anon public** key.
2. Vercel → your project → Settings → Environment Variables. Add for **Production, Preview and Development**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
   - (server only) `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `XAI_API_KEY`
3. Vercel → Deployments → **Redeploy** the latest one (uncheck "use existing build cache"). Env changes don't apply to old builds.
4. Supabase → Authentication → URL Configuration:
   - Site URL = `https://YOUR-DOMAIN`
   - Redirect URLs (add all of these):
     - `https://YOUR-DOMAIN/auth/callback`
     - `https://YOUR-DOMAIN/app`
     - `http://localhost:3000/auth/callback` (for local development)
     - `http://localhost:3000/app` (for local development)
5. Supabase → SQL Editor: apply the schema and migrations **in the order listed in [`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md)**, one file at a time, then run `supabase/verify_setup.sql` (every row must show `true`). Back up first. Never run these as part of a frontend build or deployment.

6. **Optional, demo databases only: sample companies (ABC Roofing & XYZ Roofing).**
   Migration 011 no longer creates them. To try the multi-company switcher on a throwaway database, run `supabase/seed_demo.sql`, then link a user (replace the placeholder with the user's `auth.users` id):
   ```sql
   insert into public.organization_memberships (tenant_id, user_id, role)
   values
     ('11111111-aaaa-4111-8111-111111111111', 'user-uuid-here', 'owner'),
     ('22222222-bbbb-4222-8222-222222222222', 'user-uuid-here', 'admin')
   on conflict (tenant_id, user_id) do update set role = excluded.role;
   ```
   Do not do this on production: the sample companies' widget keys are public.

7. Never put the service-role key in a `VITE_` variable or client-side code.
