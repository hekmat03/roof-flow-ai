/**
 * GET /api/plans — the plan catalogue the UI renders.
 * Public: prices and feature lists are marketing copy, not secrets. No price ids
 * are returned, only whether a real one is configured behind a paid plan.
 */
import { createFileRoute } from "@tanstack/react-router";
import { planCatalog } from "../../lib/plans";
import { json } from "../../lib/http";
import { paymentsActivated } from "../../lib/billing";

export const Route = createFileRoute("/api/plans")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, paymentsActivated: paymentsActivated(), ...planCatalog() }),
    },
  },
});
