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

The root Vite application is built to `dist`. Use `npx vercel dev` to run the Vercel API routes locally as well as the frontend. Live AI requires `XAI_API_KEY` (xAI Grok); without it, the dashboard chatbot uses its offline reply generator and live-AI widget acknowledgements are unavailable.

## Embeddable widget

The contractor widget assets are `public/widget.js` and `public/widget.html`. Add the script to the contractor's website and use the public widget key shown in the CRM:

```html
<script src="https://YOUR-DOMAIN/widget.js" data-key="YOUR_WIDGET_KEY" async></script>
```

The widget guides a visitor through a roof concern, property ZIP, name, contact details and explicit follow-up consent, then submits the inquiry to `/api/leads`. A live-AI acknowledgement is optional; the guided flow remains available without it. The widget does not promise answers about a contractor's hours, prices or FAQs.

## Supabase migrations

The full, ordered list (including `schema.sql` and every numbered file), what each one does, how to check a database you already have, and how to test a fresh install is in **[`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md)**. That file is the single source of truth; do not copy its list elsewhere.

In short: run the files in the SQL Editor, one at a time, in the order given there, then run `supabase/verify_setup.sql`. Back up the target database first. This repository never applies migrations automatically. The legacy scripts `migration.sql` and `tenants.sql` must not be run, and the sample companies live in the optional `seed_demo.sql` (demo databases only).

## Environment variables

Copy `.env.example` to `.env.local` for local development. Never commit real credentials. The following names are defined there:

| Variable | Purpose / requirement |
|---|---|
| `XAI_API_KEY` | Server-side xAI Grok API key; required for live AI responses. |
| `AI_MODEL` | Optional model override; defaults to `grok-4.3`. |
| `AI_REASONING_EFFORT` | Optional (`none` default, `low`, `medium`, `high`, `off`). |
| `AI_PROVIDER` / `GROQ_API_KEY` | Optional: `AI_PROVIDER=groq` switches to GroqCloud. |
| `SUPABASE_URL` | Server-side Supabase URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key; required by privileged API operations. |
| `EMAIL_PROVIDER_API_KEY` | Optional Resend API key; without it, no real email is sent. |
| `EMAIL_FROM` | Optional verified sender, for example `RoofFlow <hello@yourdomain.com>`. |
| `CRON_SECRET` | Bearer secret required by the scheduled email worker. |
| `VITE_SUPABASE_URL` | Supabase URL for the browser client. |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key for the browser client; row-level security protects data. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Calendar connection. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL; set it to this deployment's `/api/google/callback` URL. |
| `SESSION_SECRET` | Secret used to sign OAuth state and unsubscribe tokens. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Optional separate key for stored Google tokens; defaults to `SESSION_SECRET`. |
| `APP_BASE_URL` | Public application URL used for redirects and unsubscribe links. |

Email follow-up setup and the manual verification checklist are in [EMAIL_SETUP.md](EMAIL_SETUP.md).

Supabase browser credentials are required for authenticated tenant storage. Google Calendar variables are needed only when that integration is configured. Keep service-role, billing, OAuth and signing secrets server-side.

## Main project paths

| Path | Purpose |
|---|---|
| `src/` | Vite frontend, dashboard, CRM, onboarding and chatbot. |
| `public/widget.js` | Embeds the contractor lead-capture widget. |
| `public/widget.html` | Guided widget conversation and consent flow. |
| `api/` | Vercel serverless routes for chatbot, lead capture, follow-up email and Calendar operations. |
| `supabase/` | Database migrations, `MIGRATIONS.md` (the order), `verify_setup.sql`, optional `seed_demo.sql`. |
| `tests/` | Offline checks for generators, API helpers, integrations and validation. |
