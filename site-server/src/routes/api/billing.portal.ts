/**
 * POST /api/billing/portal — open the Stripe customer portal ("Manage billing").
 * Keyless by design: returns `{ paymentsActivated: false }` until a real Stripe
 * secret key exists, so the UI can disable the button with an honest tooltip.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "../../lib/auth";
import { createPortalSession } from "../../lib/billing";
import { isSameOrigin, json, requestOrigin } from "../../lib/http";

export const Route = createFileRoute("/api/billing/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const session = sessionFromRequest(request);
        if (!session) {
          return json({ ok: false, error: "not_authenticated", message: "Sign in to manage billing." }, 401);
        }
        const result = await createPortalSession({ userId: session.userId, origin: requestOrigin(request) });
        if (result.paymentsActivated === false) return json({ ok: false, ...result }, 503);
        if (result.error) return json({ ok: false, ...result }, 409);
        return json({ ok: true, ...result });
      },
    },
  },
});
