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
5. Supabase → SQL Editor: run `supabase/schema.sql`, then `001_multitenant.sql`, `002_billing.sql`, `003_ratelimit.sql`, `004_calendar.sql`.
6. Optional while testing: Authentication → Providers → Email → turn off "Confirm email" so sign-up logs in instantly.

Never put the service-role key in a `VITE_` variable.
