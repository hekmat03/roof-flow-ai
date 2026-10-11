-- ============================================================================
-- RoofFlow AI — Supabase schema for real website-widget leads
-- ============================================================================
-- HOW TO APPLY
--   1. Create a Supabase project (free tier is fine): https://supabase.com
--   2. Open the project → SQL Editor → New query.
--   3. Paste this entire file and click "Run". It is idempotent — safe to re-run.
--   4. Copy the project's URL and its **service_role** key
--      (Project Settings → API) into our site's Secrets panel as:
--          SUPABASE_URL
--          SUPABASE_SERVICE_ROLE_KEY
--      The service_role key is a SERVER secret. It is never sent to a browser,
--      never placed in the widget, and never committed to this repository.
--   5. Confirm it works: POST an empty body to /api/leads on the live site and
--      expect `{"ok":false,"error":"validation",...}` (a 400, NOT a 503) — a 503
--      means the two secrets above are still missing.
--
-- SECURITY MODEL
--   Row Level Security is ENABLED with NO policies. That is deliberate: it makes
--   the table deny-all to the `anon` and `authenticated` roles, so the public
--   publishable key cannot read or write leads even if it leaks. ONLY the
--   service_role key — used exclusively inside our server routes — touches this
--   table. The browser never holds a secret.
--
-- PRIVACY
--   consent + consent_text record exactly what the visitor agreed to and when the
--   row was written (created_at). Nothing else about the visitor is collected:
--   no cookies, no device fingerprint, no third-party trackers. user_agent is
--   stored only to diagnose junk submissions and can be nulled at any time.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  phone         text null,
  email         text null,
  zip_code      text,
  roofing_need  text,
  consent       boolean,
  consent_text  text,
  -- Full widget transcript: [{ sender, text, timestamp }, ...]
  conversation  jsonb not null default '[]'::jsonb,
  lead_score    int,
  status        text default 'New Lead',
  source        text default 'Website Widget',
  user_agent    text null,
  created_at    timestamptz not null default now()
);

-- The CRM board lists newest-first, so index the sort key.
create index if not exists leads_created_at_idx on public.leads (created_at desc);
-- Cheap de-duplication check for the same person submitting twice.
create index if not exists leads_contact_idx on public.leads (email, phone);

-- Deny-all to anon/authenticated; the service role bypasses RLS by design.
alter table public.leads enable row level security;

-- Belt-and-suspenders: even if a policy is added later by mistake, these revokes
-- keep the public roles out.
revoke all on table public.leads from anon;
revoke all on table public.leads from authenticated;

comment on table public.leads is
  'Real leads captured by the embeddable website widget. RLS enabled with no policies: service_role only.';
comment on column public.leads.consent_text is
  'Exact consent wording the visitor agreed to, stored verbatim for compliance.';
comment on column public.leads.lead_score is
  'Deterministic 0-100 score computed server-side at insert (see site/src/lib/leads-core.ts scoreLead).';
