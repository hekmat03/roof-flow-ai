/**
 * GET /api/leads — the CRM board's read endpoint (audit C1).
 * ---------------------------------------------------------------------------
 * Kept out of the route module so it can be tested without booting the
 * framework: `site-server/tests/leads-auth.check.ts` imports this function
 * directly and asserts that an unauthenticated caller gets nothing.
 *
 * The rules, in order:
 *  1. **A valid session is required.** No session, no data — 401, before the
 *     database is touched at all. Before this fix the endpoint had no session
 *     check whatsoever and `curl /api/leads` received the 200 most recent
 *     homeowners' names, phones, emails, ZIPs and chat transcripts.
 *  2. A request that names a FOREIGN Origin is still rejected (CSRF defence).
 *     A missing Origin is tolerated here only because browsers omit it on
 *     same-origin GETs — it is never treated as proof of anything, which is why
 *     the session check comes first.
 *  3. The response is an explicit column allowlist ({@link LEAD_LIST_COLUMNS}),
 *     never `select=*`.
 *
 * NOTE: the session identifies a user, not a tenant. Every signed-in user still
 * sees every row — that is finding C2 (needs a `tenant_id` column and an owner
 * decision on the schema), deliberately NOT addressed here.
 */
import { sessionFromRequest } from "./auth";
import { isSameOrigin } from "./http";
import {
  dbConfigured,
  json,
  LEAD_LIST_COLUMNS,
  listLeads,
  notConfigured,
  type LeadListRow,
} from "./leads-core";

/** How many of the most recent leads the CRM board asks for. */
export const LIST_LIMIT = 200;

export const handleListLeads = async (request: Request): Promise<Response> => {
  // 1. Authentication first: an anonymous caller must not learn anything —
  //    not the row count, not whether the database is configured.
  const session = sessionFromRequest(request);
  if (!session) return json({ ok: false, error: "not_authenticated" }, 401);

  // 2. CSRF: reject a request that declares a foreign Origin. An absent Origin
  //    is allowed only because the session check above already passed.
  if (!isSameOrigin(request, { allowMissingOrigin: true }))
    return json({ ok: false, error: "forbidden_origin" }, 403);

  if (!dbConfigured()) return notConfigured();

  try {
    const rows: LeadListRow[] = await listLeads(LIST_LIMIT, LEAD_LIST_COLUMNS);
    return json({ ok: true, leads: rows, count: rows.length });
  } catch {
    // Never log the rows: they are PII. Status only.
    console.error("[leads] list failed");
    return json({ ok: false, error: "storage_error" }, 500);
  }
};
