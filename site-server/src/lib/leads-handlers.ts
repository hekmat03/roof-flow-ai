/**
 * leads-handlers.ts — the logic behind /api/leads, as plain Request → Response.
 * ---------------------------------------------------------------------------
 * Kept out of the route file so the privacy guarantees can be tested offline
 * (tests/leads-isolation.check.ts) without booting the web framework.
 *
 *   POST  public. Cross-origin (the widget lives on contractor sites). Must name
 *         a contractor by widget key; the tenant is looked up server-side and
 *         stamped on the row. A tenant id in the body is ignored.
 *   GET   private. Same-origin only, requires a signed-in user, returns ONLY
 *         that user's tenant's leads. Never carries CORS headers.
 */
import {
  CORS_HEADERS,
  clean,
  clientIp,
  dbConfigured,
  insertLead,
  json as publicJson,
  listLeads,
  notConfigured,
  rateLimit,
  recordSuccess,
  scoreLead,
  validateLead,
  type LeadInput,
} from "./leads-core";
import { isSameOrigin, json as privateJson } from "./http";
import { authenticate } from "./request-auth";
import { isWidgetKey, tenantForUser, tenantIdForWidgetKey } from "./tenant";

const LIST_LIMIT = 200;

export const handleLeadsOptions = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

/* -------------------------------------------------------------------------- */
/* POST — widget lead capture                                                  */
/* -------------------------------------------------------------------------- */

const badWidget = (status: number): Response =>
  // One generic message for "missing", "malformed" and "unknown": a caller learns
  // nothing about which company keys exist.
  publicJson(
    { ok: false, error: "invalid_widget", message: "This chat widget isn't set up correctly. Please contact the business directly." },
    status
  );

export const handleLeadsPost = async (request: Request): Promise<Response> => {
  // 1. Parse (bad JSON is a client error, not a 500).
  let input: LeadInput;
  try {
    input = (await request.json()) as LeadInput;
  } catch {
    return publicJson({ ok: false, error: "bad_json" }, 400);
  }

  const ip = clientIp(request);

  // 2. Rate limit (checked before any work; only successes consume quota).
  const limit = rateLimit(ip);
  if (!limit.allowed) {
    return publicJson(
      { ok: false, error: "rate_limited", message: "Too many submissions — please try again shortly." },
      429,
      { "Retry-After": String(limit.retryAfterSec) }
    );
  }

  // 3. Which contractor is this for? Shape-check before any storage work.
  const widgetKey = typeof input.widget_key === "string" ? input.widget_key.trim() : "";
  if (!isWidgetKey(widgetKey)) return badWidget(400);

  // 4. Validate the visitor's fields BEFORE touching storage, so a malformed
  //    submission gets an accurate 400 even when the database isn't connected.
  const result = validateLead(input);
  if (!result.ok) {
    return publicJson({ ok: false, error: "validation", field: result.failure.field, message: result.failure.error }, 400);
  }

  // 5. Storage configured? (Only a well-formed lead can reach here.)
  if (!dbConfigured()) return notConfigured();

  try {
    // 6. Resolve the tenant from the key. The tenant is NEVER read from the body.
    const tenantId = await tenantIdForWidgetKey(widgetKey);
    if (!tenantId) {
      // A wrong key consumes quota too, so key guessing is throttled.
      recordSuccess(ip);
      return badWidget(404);
    }

    // 7. Score (server-side, deterministic) and store under that tenant.
    const { score } = scoreLead(result.lead);
    const row = await insertLead(result.lead, {
      tenantId,
      userAgent: clean(request.headers.get("user-agent"), 300) || null,
      score,
    });
    recordSuccess(ip);
    // No PII in logs: shape/counters only.
    console.log("[leads] insert ok", { hasPhone: Boolean(row.phone), hasEmail: Boolean(row.email), score });
    return publicJson({ ok: true, id: row.id, score: row.lead_score }, 201);
  } catch (e) {
    // Never surface internal detail to a public caller.
    console.error("[leads] insert failed", e instanceof Error ? e.message : "unknown");
    return publicJson({ ok: false, error: "storage_error", message: "We couldn't save that just now — please try again." }, 500);
  }
};

/* -------------------------------------------------------------------------- */
/* GET — the signed-in contractor's own CRM                                    */
/* -------------------------------------------------------------------------- */

export const handleLeadsGet = async (request: Request): Promise<Response> => {
  if (!isSameOrigin(request)) return privateJson({ ok: false, error: "forbidden_origin" }, 403);

  // Must come before authenticate(): session cookies are signed with the service
  // key, and an unconfigured server would sign with an empty one.
  if (!dbConfigured()) {
    return privateJson({ ok: false, error: "database_not_configured" }, 503);
  }

  const user = await authenticate(request);
  if (!user) return privateJson({ ok: false, error: "unauthenticated", message: "Sign in to see your leads." }, 401);

  try {
    const tenant = await tenantForUser(user.userId, user.email);
    // No workspace → no leads. Fail closed; never fall back to "all leads".
    if (!tenant) return privateJson({ ok: false, error: "no_workspace", message: "Your workspace isn't ready yet." }, 403);

    const rows = await listLeads(tenant.tenantId, LIST_LIMIT);
    return privateJson({ ok: true, leads: rows, count: rows.length, widget_key: tenant.widgetKey });
  } catch {
    console.error("[leads] list failed");
    return privateJson({ ok: false, error: "storage_error" }, 500);
  }
};
