/**
 * /api/leads
 * ---------------------------------------------------------------------------
 * POST    : public lead capture from the embeddable widget (cross-origin). The
 *           widget names its contractor by public key; the tenant is resolved
 *           server-side and stamped on the lead.
 * GET     : the signed-in contractor's OWN leads. Requires authentication and
 *           is filtered by that user's tenant. Same-origin only.
 * OPTIONS : CORS preflight for the cross-origin POST.
 *
 * All logic lives in src/lib/leads-handlers.ts (unit-tested offline). The
 * service-role key lives only in the server environment — never in a browser.
 * Nothing here logs PII; only counters and booleans are ever written to the log.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleLeadsGet, handleLeadsOptions, handleLeadsPost } from "../../lib/leads-handlers";

export const Route = createFileRoute("/api/leads")({
  server: {
    handlers: {
      OPTIONS: async () => handleLeadsOptions(),
      POST: async ({ request }) => handleLeadsPost(request),
      GET: async ({ request }) => handleLeadsGet(request),
    },
  },
});
