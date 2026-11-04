/**
 * GET /api/billing/status — the single source of truth the Billing UI renders.
 *
 * It states plainly whether payments exist at all. Payments count as activated
 * when either provider can actually fulfil a purchase: Lemon Squeezy (the live
 * one — secret + both variant ids + both hosted buy links) or Stripe (dormant
 * until a secret key exists). When neither is configured the answer is
 * `paymentsActivated: false` and every date field is null, so the UI shows "—"
 * instead of inventing a renewal date.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "../../lib/auth";
import { getProfile, paymentsActivated as stripeActivated } from "../../lib/billing";
import { isSameOrigin, json } from "../../lib/http";
import { planCatalog } from "../../lib/plans";
import {
  checkoutUrlForPlan,
  lemonPaymentsActivated,
  lemonWebhookSecret,
  variantIdForPlan,
} from "../../lib/lemon";
import { usageSnapshot } from "../../lib/usage";

/**
 * The catalogue, with `priceIdConfigured` telling the truth for the provider
 * that is actually live: a plan is buyable when its Lemon Squeezy hosted buy
 * link is saved, even if no Stripe price id exists.
 */
const catalogue = () => {
  const base = planCatalog();
  return {
    ...base,
    plans: base.plans.map((plan) =>
      plan.id === "free"
        ? plan
        : { ...plan, priceIdConfigured: plan.priceIdConfigured || checkoutUrlForPlan(plan.id) !== null }
    ),
  };
};

/** What the owner still has to save, without ever echoing a value. */
const paymentsState = () => {
  const lemon = lemonPaymentsActivated();
  const stripe = stripeActivated();
  return {
    paymentsActivated: lemon || stripe,
    provider: lemon ? "lemonsqueezy" : stripe ? "stripe" : null,
    lemon: {
      webhookSecretConfigured: Boolean(lemonWebhookSecret()),
      variantsConfigured: {
        starter: Boolean(variantIdForPlan("starter")),
        pro: Boolean(variantIdForPlan("pro")),
      },
      buyLinksConfigured: {
        starter: checkoutUrlForPlan("starter") !== null,
        pro: checkoutUrlForPlan("pro") !== null,
      },
    },
  };
};

export const Route = createFileRoute("/api/billing/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Browser GETs carry no Origin; a foreign Origin is still rejected.
        if (!isSameOrigin(request, { allowMissingOrigin: true }))
          return json({ ok: false, error: "forbidden_origin" }, 403);
        const session = sessionFromRequest(request);
        const payments = paymentsState();

        // Signed-out visitors still get the catalogue and the activation state,
        // so the pricing page renders correctly for everyone.
        if (!session) {
          return json({
            ok: true,
            ...payments,
            authenticated: false,
            user: null,
            plan: "free",
            subscription: null,
            usage: null,
            ...catalogue(),
          });
        }

        const profile = await getProfile(session.userId).catch(() => null);
        const usage = await usageSnapshot(session.userId);
        return json({
          ok: true,
          ...payments,
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
          ...catalogue(),
        });
      },
    },
  },
});
