/**
 * POST /api/billing/checkout — start a subscription checkout.
 * Keyless by design: without STRIPE_SECRET_KEY the response is a clean
 * `{ paymentsActivated: false }` and no network call is made. The plan is
 * validated against the server catalogue, so a forged plan id cannot change the
 * price that would be charged.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "../../lib/auth";
import { createCheckoutSession } from "../../lib/billing";
import { isSameOrigin, json, readJson, requestOrigin } from "../../lib/http";
import { isPlanId } from "../../lib/plans";

interface Body {
  plan?: unknown;
}

export const Route = createFileRoute("/api/billing/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const body = await readJson<Body>(request);
        const rawPlan = body?.plan;
        if (!isPlanId(rawPlan)) {
          return json({ ok: false, error: "invalid_plan", message: "Choose the Starter or Pro plan." }, 400);
        }
        if (rawPlan === "free") {
          return json({ ok: false, error: "invalid_plan", message: "The Free plan needs no checkout." }, 400);
        }
        const plan = rawPlan;

        const session = sessionFromRequest(request);
        if (!session) {
          return json(
            { ok: false, error: "not_authenticated", message: "Create an account (it takes a moment) before choosing a paid plan." },
            401
          );
        }

        const result = await createCheckoutSession({
          userId: session.userId,
          plan,
          origin: requestOrigin(request),
          email: session.email,
        });
        if ("paymentsActivated" in result && result.paymentsActivated === false) {
          return json({ ok: false, ...result }, 503);
        }
        if ("error" in result) return json({ ok: false, ...result }, 409);
        return json({ ok: true, ...result });
      },
    },
  },
});
