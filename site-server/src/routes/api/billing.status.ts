/**
 * GET /api/billing/status — the single source of truth the Billing UI renders.
 *
 * It states plainly whether payments exist at all. With no STRIPE_SECRET_KEY the
 * answer is `paymentsActivated: false` and every date field is null, so the UI
 * shows "—" instead of inventing a renewal date.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "../../lib/auth";
import { getProfile, paymentsActivated } from "../../lib/billing";
import { isSameOrigin, json } from "../../lib/http";
import { planCatalog } from "../../lib/plans";
import { usageSnapshot } from "../../lib/usage";

export const Route = createFileRoute("/api/billing/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const session = sessionFromRequest(request);

        // Signed-out visitors still get the catalogue and the activation state,
        // so the pricing page renders correctly for everyone.
        if (!session) {
          return json({
            ok: true,
            paymentsActivated: paymentsActivated(),
            authenticated: false,
            user: null,
            plan: "free",
            subscription: null,
            usage: null,
            ...planCatalog(),
          });
        }

        const profile = await getProfile(session.userId).catch(() => null);
        const usage = await usageSnapshot(session.userId);
        return json({
          ok: true,
          paymentsActivated: paymentsActivated(),
          authenticated: true,
          user: { id: session.userId, email: session.email },
          plan: usage.plan,
          subscription: {
            status: profile?.subscription_status ?? "none",
            currentPeriodStart: profile?.current_period_start ?? null,
            currentPeriodEnd: profile?.current_period_end ?? null,
            cancelAtPeriodEnd: profile?.cancel_at_period_end ?? false,
            hasCustomer: Boolean(profile?.stripe_customer_id),
            hasPrice: Boolean(profile?.price_id),
          },
          usage,
          ...planCatalog(),
        });
      },
    },
  },
});
