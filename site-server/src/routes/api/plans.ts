/**
 * GET /api/plans — the plan catalogue the UI renders.
 * Public: prices and feature lists are marketing copy, not secrets. No checkout
 * links are returned, only whether one is configured behind a paid plan.
 */
import { createFileRoute } from "@tanstack/react-router";
import { planCatalog } from "../../lib/plans";
import { json } from "../../lib/http";
import { checkoutUrlForPlan, lemonPaymentsActivated } from "../../lib/lemon";

export const Route = createFileRoute("/api/plans")({
  server: {
    handlers: {
      GET: async () => {
        const base = planCatalog();
        return json({
          ok: true,
          paymentsActivated: lemonPaymentsActivated(),
          ...base,
          plans: base.plans.map((plan) =>
            plan.id === "free" ? plan : { ...plan, priceIdConfigured: checkoutUrlForPlan(plan.id) !== null }
          ),
        });
      },
    },
  },
});
