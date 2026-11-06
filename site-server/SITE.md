## Lead privacy & company isolation

Every lead belongs to exactly one company (tenant). The service-role key bypasses
Row Level Security, so isolation is enforced in the server code, not by the DB alone.

- `GET /api/leads` requires a signed-in user (Supabase bearer token or `rf_session`
  cookie), resolves that user's tenant from `profiles.tenant_id`, and returns only
  that tenant's leads. Anonymous → 401. There is no "all leads" code path.
- `POST /api/leads` (the public widget) requires a `widget_key`. The server maps it
  to a tenant (`tenants.widget_key`) and stamps `tenant_id` on the row. A tenant id
  sent in the request body is ignored.
- Embed snippet: `<script src=".../widget.js" data-key="wk_…" async></script>`.
  The key is shown in the CRM's "Live Widget Leads" panel. It is a public
  identifier: it can add leads to that company only, never read.
- Leads captured before this change have `tenant_id IS NULL` and are visible to
  nobody until assigned (see the clean-up notes in `supabase/006_lead_tenant_isolation.sql`).

Deploy order: run `supabase/006_lead_tenant_isolation.sql` → deploy the server →
rebuild/redeploy the SPA → give each contractor their new embed snippet.
Test: `bun run tests/leads-isolation.check.ts`.
