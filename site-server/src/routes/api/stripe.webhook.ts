/**
 * POST /api/stripe/webhook — Stripe subscription events.
 *
 * Reads the RAW body: re-serialising the JSON would change the bytes and break
 * the signature, so this route deliberately does not use `request.json()`.
 *
 * With no STRIPE_SECRET_KEY the route answers 503 with
 * `{ paymentsActivated: false }`. With a key but no STRIPE_WEBHOOK_SECRET it
 * answers 503 too: an unverifiable delivery is never trusted. Stripe retries, so
 * nothing is lost.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleWebhook } from "../../lib/billing";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("stripe-signature");
        const outcome = await handleWebhook(raw, signature);
        return new Response(JSON.stringify(outcome.body), {
          status: outcome.status,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      },
    },
  },
});
