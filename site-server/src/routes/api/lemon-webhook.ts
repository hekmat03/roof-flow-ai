/**
 * POST /api/lemon-webhook — Lemon Squeezy subscription events.
 *
 * This is the live-site twin of the app repo's `api/lemon-webhook.ts`. Point the
 * Lemon Squeezy webhook at
 *   https://<this-site>/api/lemon-webhook
 * with the signing secret from LS_WEBHOOK_SECRET and the events
 * subscription_created / subscription_updated / subscription_cancelled /
 * subscription_resumed / subscription_expired / subscription_paused /
 * subscription_unpaused. (subscription_payment_* is acknowledged and ignored:
 * failed and recovered payments already arrive as subscription_updated with
 * status past_due / active.)
 *
 * The RAW body is read as bytes: re-serialising the JSON would change them and
 * break the HMAC, so this route never calls `request.json()`.
 *
 * Codes: 200 applied or ignored, 400 unverifiable payload, 401 bad signature,
 * 503 not configured (secret or database missing). No secret, no body echo.
 */
import { createFileRoute } from "@tanstack/react-router";
import { json } from "../../lib/http";
import {
  handleLemonWebhook,
  lemonPaymentsActivated,
  lemonWebhookSecret,
  variantIdForPlan,
} from "../../lib/lemon";
import { isConfigured } from "../../lib/supabase-admin";

export const Route = createFileRoute("/api/lemon-webhook")({
  server: {
    handlers: {
      // Read-only self-description, so the owner (or a teammate) can confirm the
      // route is live and see what is still missing without sending an event.
      GET: () => {
        const secretConfigured = Boolean(lemonWebhookSecret());
        const databaseConfigured = isConfigured();
        return json({
          ok: true,
          route: "lemon-webhook",
          method: "POST",
          signatureHeader: "X-Signature",
          configured: secretConfigured && databaseConfigured,
          secretConfigured,
          databaseConfigured,
          paymentsActivated: lemonPaymentsActivated(),
          variants: {
            starterConfigured: Boolean(variantIdForPlan("starter")),
            proConfigured: Boolean(variantIdForPlan("pro")),
          },
          events: [
            "subscription_created",
            "subscription_updated",
            "subscription_cancelled",
            "subscription_resumed",
            "subscription_expired",
            "subscription_paused",
            "subscription_unpaused",
          ],
        });
      },

      POST: async ({ request }) => {
        // Bytes, not text: the signature covers exactly these bytes.
        const raw = new Uint8Array(await request.arrayBuffer());
        const outcome = await handleLemonWebhook(raw, request.headers.get("x-signature"));
        return json(outcome.body, outcome.status);
      },
    },
  },
});
