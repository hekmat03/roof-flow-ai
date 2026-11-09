# RoofFlow AI

RoofFlow AI is a Vite application for roofing contractors. It includes a dashboard chatbot, a tenant-scoped CRM, onboarding and company configuration, an embeddable lead-capture widget, and an optional public product demo.

## How leads are stored

Authenticated contractor leads are stored in Supabase in `public.leads`, with a `tenant_id` on each row and row-level security separating one contractor's records from another's. Leads are not stored in the browser as the production source of truth. The `/api/leads` endpoint assigns tenant ownership from the authenticated user or the widget's public key; it does not accept a tenant ID supplied by the browser.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
```

The root Vite application is built to `dist`. Use `npx vercel dev` to run the Vercel API routes locally as well as the frontend. Live AI requires `MISTRAL_API_KEY`; without it, the dashboard chatbot uses its offline reply generator and live-AI widget acknowledgements are unavailable.

## Embeddable widget

The contractor widget assets are `public/widget.js` and `public/widget.html`. Add the script to the contractor's website and use the public widget key shown in the CRM:

```html
<script src="https://YOUR-DOMAIN/widget.js" data-key="YOUR_WIDGET_KEY" async></script>
```

The widget guides a visitor through a roof concern, property ZIP, name, contact details and explicit follow-up consent, then submits the inquiry to `/api/leads`. A live-AI acknowledgement is optional; the guided flow remains available without it. The widget does not promise answers about a contractor's hours, prices or FAQs.

## Supabase migrations

Apply these SQL files in the listed order in the intended Supabase environment:

1. `supabase/001_multitenant.sql` — tenant tables, user profiles and row-level security.
2. `supabase/002_billing.sql` — subscription fields and chat usage limits.
3. `supabase/003_ratelimit.sql` — shared API rate-limit storage and RPC.
4. `supabase/004_calendar.sql` — tenant calendar connection storage.
5. `supabase/005_onboarding.sql` — contractor onboarding profiles.
6. `supabase/006_lead_tenant_isolation.sql` — tenant-scoped widget lead capture and widget keys.
7. `supabase/007_agent_tenant_isolation.sql` — tenant ownership for agent-written data.
8. `supabase/008_rate_limit_service_role.sql` — permission for the service role to call the rate-limit RPC.
9. `supabase/008_spend_limits.sql` — atomic spend limits.
10. `supabase/009_followups.sql` — business mailing address, scheduled email queue, suppression and usage caps.
11. `supabase/010_followup_schedule_days.sql` — permits the Day 1/2/4/7 sequence and retains historic Day 3 rows.

Review each migration and back up the target database before applying changes. This README does not apply migrations automatically.

## Environment variables

Copy `.env.example` to `.env.local` for local development. Never commit real credentials. The following names are defined there:

| Variable | Purpose / requirement |
|---|---|
| `MISTRAL_API_KEY` | Server-side API key; required for live AI responses. |
| `MISTRAL_MODEL` | Optional model override; defaults to `mistral-small-latest`. |
| `SUPABASE_URL` | Server-side Supabase URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key; required by privileged API operations. |
| `EMAIL_PROVIDER_API_KEY` | Optional Resend API key; without it, no real email is sent. |
| `EMAIL_FROM` | Optional verified sender, for example `RoofFlow <hello@yourdomain.com>`. |
| `CRON_SECRET` | Bearer secret required by the scheduled email worker. |
| `VITE_SUPABASE_URL` | Supabase URL for the browser client. |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key for the browser client; row-level security protects data. |
| `LS_WEBHOOK_SECRET` | Lemon Squeezy webhook verification secret. |
| `LS_VARIANT_STARTER` | Starter subscription variant ID. |
| `LS_VARIANT_PRO` | Pro subscription variant ID. |
| `LS_CHECKOUT_URL_STARTER` | Starter hosted checkout URL. |
| `LS_CHECKOUT_URL_PRO` | Pro hosted checkout URL. |
| `LS_API_KEY` | Optional Lemon Squeezy API key used to create billing portal links. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Calendar connection. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL; set it to this deployment's `/api/google/callback` URL. |
| `SESSION_SECRET` | Secret used to sign OAuth state and unsubscribe tokens. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Optional separate key for stored Google tokens; defaults to `SESSION_SECRET`. |
| `APP_BASE_URL` | Public application URL used for redirects and unsubscribe links. |

Email follow-up setup and the manual verification checklist are in [EMAIL_SETUP.md](EMAIL_SETUP.md).

Supabase browser credentials are required for authenticated tenant storage. Billing and Google Calendar variables are needed only when those integrations are configured. Keep service-role, billing, OAuth and signing secrets server-side.

## Main project paths

| Path | Purpose |
|---|---|
| `src/` | Vite frontend, dashboard, CRM, onboarding and chatbot. |
| `public/widget.js` | Embeds the contractor lead-capture widget. |
| `public/widget.html` | Guided widget conversation and consent flow. |
| `api/` | Vercel serverless routes for chatbot, lead capture, follow-up email, billing and Calendar operations. |
| `supabase/001_*.sql` – `supabase/009_*.sql` | Ordered database migrations (two existing 008 migrations precede 009). |
| `tests/` | Offline checks for generators, API helpers, integrations and validation. |
