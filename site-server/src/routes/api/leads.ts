/**
 * /api/leads — public lead-capture endpoint for the embeddable widget.
 * ---------------------------------------------------------------------------
 * POST : visitor submissions from widget.html (arbitrary contractor origin).
 * GET  : the latest real leads, for our OWN app's CRM board (same-origin only).
 * OPTIONS: CORS preflight for the cross-origin POST.
 *
 * The service-role key lives only in this server module's environment — the
 * visitor's browser never sees it. Nothing here logs PII; only counters and
 * booleans are ever written to the log.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  CORS_HEADERS,
  clientIp,
  clean,
  dbConfigured,
  insertLead,
  json,
  listLeads,
  notConfigured,
  rateLimit,
  recordSuccess,
  scoreLead,
  validateLead,
  type LeadInput,
  type LeadRow,
} from "../../lib/leads-core";

const LIST_LIMIT = 200;

/** Same-origin gate for GET (the CRM board is part of our own app). */
const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return true; // direct browser navigation / SSR fetch has no Origin
  try {
    const originHost = new URL(origin).host;
    const reqHost = request.headers.get("host") ?? new URL(request.url).host;
    return originHost === reqHost;
  } catch {
    return false;
  }
};

export const Route = createFileRoute("/api/leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        // 1. Parse (bad JSON is a client error, not a 500).
        let input: LeadInput;
        try {
          input = (await request.json()) as LeadInput;
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }

        const ip = clientIp(request);

        // 2. Rate limit (checked before any work; only successes consume quota).
        const limit = rateLimit(ip);
        if (!limit.allowed) {
          return json(
            { ok: false, error: "rate_limited", message: "Too many submissions — please try again shortly." },
            429,
            { "Retry-After": String(limit.retryAfterSec) }
          );
        }

        // 3. Validate BEFORE touching storage. This ordering is deliberate: a
        //    malformed submission gets an accurate 400 even when the database
        //    isn't connected yet, and a 503 then unambiguously means "storage
        //    missing" rather than "your input was wrong".
        const result = validateLead(input);
        if (!result.ok) {
          return json({ ok: false, error: "validation", field: result.failure.field, message: result.failure.error }, 400);
        }

        // 4. Storage configured? (Only a well-formed lead can reach here.)
        if (!dbConfigured()) return notConfigured();

        // 5. Score (server-side, deterministic) and store.
        const { score } = scoreLead(result.lead);
        try {
          const row = await insertLead(result.lead, {
            userAgent: clean(request.headers.get("user-agent"), 300) || null,
            score,
          });
          recordSuccess(ip);
          // No PII in logs: shape/counters only.
          console.log("[leads] insert ok", { hasPhone: Boolean(row.phone), hasEmail: Boolean(row.email), score });
          return json({ ok: true, id: row.id, score: row.lead_score }, 201);
        } catch (e) {
          // Never surface internal detail to a public caller.
          console.error("[leads] insert failed", e instanceof Error ? e.message : "unknown");
          return json({ ok: false, error: "storage_error", message: "We couldn't save that just now — please try again." }, 500);
        }
      },

      GET: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        if (!dbConfigured()) return notConfigured();
        try {
          const rows: LeadRow[] = await listLeads(LIST_LIMIT);
          return json({ ok: true, leads: rows, count: rows.length });
        } catch {
          console.error("[leads] list failed");
          return json({ ok: false, error: "storage_error" }, 500);
        }
      },
    },
  },
});
