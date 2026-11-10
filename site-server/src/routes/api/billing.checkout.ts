/**
 * /api/billing/checkout — start a subscription checkout.
 *
 * Two providers, one route, in this order:
 *  1. **Lemon Squeezy** (the live one). When the owner has saved
 *     LS_CHECKOUT_URL_STARTER / LS_CHECKOUT_URL_PRO, the hosted buy link is
 *     returned with the buyer's email and user id pre-filled. The plan itself
 *     is only ever granted by the webhook (/api/lemon-webhook), never here.
 *  2. **Stripe** (coded, dormant). Unchanged: without STRIPE_SECRET_KEY it
 *     answers `{ paymentsActivated: false }` and makes no network call.
 *
 * `GET` is a read-only view of the same configuration: the buy link per plan, or
 * a clear not-configured state. It never creates anything.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "../../lib/auth";
import { createCheckoutSession, getProfile } from "../../lib/billing";
import { isSameOrigin, json, readJson, requestOrigin } from "../../lib/http";
import { isPlanId } from "../../lib/plans";
import {
  buildCheckoutLink,
  checkoutUrlForPlan,
  effectivePlan,
  lemonPaymentsActivated,
  lemonWebhookSecret,
  variantIdForPlan,
} from "../../lib/lemon";

interface Body {
  plan?: unknown;
}

const notConfiguredMessage =
  "Payments are not set up yet: no Lemon Squeezy buy links are saved on this server, so no checkout can be opened.";

export const Route = createFileRoute("/api/billing/checkout")({
  server: {
    handlers: {
      /**
       * Configuration view. `?plan=starter|pro` returns that plan's link;
       * without it you get both links plus what is still missing. Public on
       * purpose: a hosted buy link is not a secret, and this is what makes the
       * owner's setup checkable from a browser or curl.
       */
      GET: ({ request }) => {
        const url = new URL(request.url);
        const requested = url.searchParams.get("plan");
        const links = { starter: checkoutUrlForPlan("starter"), pro: checkoutUrlForPlan("pro") };
        const base = {
          provider: "lemonsqueezy" as const,
          paymentsActivated: lemonPaymentsActivated(),
          webhookConfigured: Boolean(lemonWebhookSecret()),
          variantsConfigured: {
            starter: Boolean(variantIdForPlan("starter")),
            pro: Boolean(variantIdForPlan("pro")),
          },
        };

        if (requested !== null) {
          if (!isPlanId(requested) || requested === "free") {
            return json(
              { ok: false, error: "invalid_plan", message: "Choose the Starter or Pro plan." },
              400
            );
          }
          const plan = requested;
          const link = links[plan];
          if (!link) {
            return json(
              { ok: false, ...base, plan, url: null, message: notConfiguredMessage },
              503
            );
          }
          // A signed-in visitor gets a link pre-filled for their account.
          const session = sessionFromRequest(request);
          return json({
            ok: true,
            ...base,
            plan,
            url: buildCheckoutLink(plan, {
              userId: session?.userId ?? null,
              email: session?.email ?? null,
            }),
            authenticated: Boolean(session),
          });
        }

        return json({
          ...base,
          ok: links.starter !== null || links.pro !== null,
          links,
          message: links.starter || links.pro ? null : notConfiguredMessage,
        });
      },

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

        // ---- Lemon Squeezy (hosted buy link) --------------------------------
        const lemonLink = checkoutUrlForPlan(plan);
        if (lemonLink) {
          const profile = await getProfile(session.userId).catch(() => null);
          const current = effectivePlan(profile);
          if (current !== "free") {
            return json(
              {
                ok: false,
                paymentsActivated: true,
                error: "already_subscribed",
                message:
                  current === plan
                    ? `You are already on the ${current} plan.`
                    : 'You already have a subscription. Use "Manage billing" to change plans.',
              },
              409
            );
          }
          return json({
            ok: true,
            paymentsActivated: true,
            provider: "lemonsqueezy",
            plan,
            url: buildCheckoutLink(plan, { userId: session.userId, email: session.email }),
          });
        }

        // ---- Stripe (dormant until a secret key exists) ---------------------
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
