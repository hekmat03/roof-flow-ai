# Email follow-up setup

Real delivery is optional. Until configured, the API records outbound intent and does not send email. Phone delivery is not implemented.

## Configure the provider

1. Create a Resend account and add the sending domain in its [Domains dashboard](https://resend.com/domains).
2. Publish the SPF and DKIM DNS records Resend shows for that exact domain. Do not copy DNS values from another domain or account. Return to the Domains dashboard and wait until each required record is verified before sending.
3. Set these server-side environment variables in Vercel and in `.env.local` for local development:
   - `EMAIL_PROVIDER_API_KEY` — Resend API key.
   - `EMAIL_FROM` — verified sender, such as `RoofFlow <hello@yourdomain.com>`.
   - `CRON_SECRET` — long random secret used to authorize the scheduled worker.
   - `APP_BASE_URL` — public HTTPS origin, for example `https://app.example.com`.
   - `SESSION_SECRET` — existing server-only signing key; also signs unsubscribe links.
4. Apply the migrations in order. Existing project history has two 008 files; apply both before `supabase/009_followups.sql`, then apply `supabase/010_followup_schedule_days.sql`. Do not run these against production without the project's normal database approval and backup process.
5. Vercel Hobby only allows one cron run per day, so `vercel.json` runs `/api/cron/send-followups` once daily (03:00 UTC) as a backstop. For follow-ups every 15 minutes, add a free external scheduler (e.g. cron-job.org) that sends a GET or POST to `/api/cron/send-followups` every 15 minutes with the header `Authorization: Bearer <CRON_SECRET>`. Keep `CRON_SECRET` set in the deployment environment; requests without its bearer value are rejected. On Vercel Pro you can set the schedule in `vercel.json` back to `*/15 * * * *`.

## Safety rules implemented

- Free has no email sends; Starter is capped at 200 per month; Pro at 1,000 per month; all plans share a 100-per-day cap.
- A scheduled sequence requires a tenant-owned lead, a consented lead whose conversation contains that email address, an eligible lead status, no suppression record, and a business mailing address of at least 10 trimmed characters.
- Single replies do not require a mailing address. They still require the email to be present in the current conversation and include an unsubscribe link.
- Messages include the contractor profile email as Reply-To, contractor name/address in the footer, and one-click unsubscribe headers/link.
- Only the email channel is supported. The worker rechecks plan, lead, suppression and address immediately before send.
- Queue claims use `FOR UPDATE SKIP LOCKED`; retries use the same provider idempotency key and stop after three attempts.

## Manual verification checklist

These checks require a dedicated test tenant and non-production provider configuration. Do not use real homeowner addresses without authorization.

- Save and reload a business mailing address in Configuration. Verify a previously onboarded account remains on the dashboard and does not see onboarding again.
- With no valid business address, confirm Agent 3 displays “Add your business mailing address to send email follow-ups”, links to Configuration, and cannot start a sequence. Confirm an Agent 4 estimate follow-up is also blocked.
- Configure a verified test sender and click “Send a test email to myself”. Confirm the footer, contractor Reply-To, unsubscribe link, and one-click headers.
- Select a consented test lead in Agent 3 and start a sequence. Confirm the queue contains Day 1, Day 2, Day 4, and Day 7 pending rows; cancel one pending row and verify its state changes.
- Mark an eligible test lead “Estimate Sent” in the CRM, opt in from Agent 4, then opt out and verify pending estimate follow-up is cancelled.
- Call `/api/cron/send-followups` without authorization and confirm HTTP 401. Call it with `Authorization: Bearer <CRON_SECRET>` and confirm a successful worker response.
- Unsubscribe using a test email's link; verify the tenant suppression row exists and pending messages to that address are cancelled.
- Confirm a Free account receives an upgrade-required response and the worker cancels or skips messages if a tenant is downgraded before send.
-
