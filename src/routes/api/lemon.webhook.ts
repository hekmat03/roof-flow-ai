
 // site-server/src/routes/api/lemon.webhook.ts — Task 4 (replaces stripe.webhook.ts)
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminFetch } from "../../lib/supabase-admin";

// map your Lemon Squeezy variant ids -> plan (set in env)
const VARIANTS: Record<string, "starter" | "pro"> = {
  [process.env.LS_VARIANT_STARTER ?? "x1"]: "starter",
  [process.env.LS_VARIANT_PRO ?? "x2"]: "pro",
};

export const Route = createFileRoute("/api/lemon/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = process.env.LS_WEBHOOK_SECRET;
        if (!secret) return new Response("not configured", { status: 503 });

        const sig = Buffer.from(request.headers.get("x-signature") ?? "", "hex");
        const mac = createHmac("sha256", secret).update(raw).digest();
        if (sig.length !== mac.length || !timingSafeEqual(sig, mac))
          return new Response("bad signature", { status: 401 });

        const evt = JSON.parse(raw);
        const userId = evt.meta?.custom_data?.user_id as string | undefined; // pass in checkout URL: ?checkout[custom][user_id]=...
        const a = evt.data?.attributes ?? {};
        if (!userId) return new Response("no user", { status: 200 });

        const active = ["active", "on_trial", "past_due"].includes(a.status);
        const plan = active ? VARIANTS[String(a.variant_id)] ?? "free" : "free";

        await adminFetch(`/rest/v1/profiles?user_id=eq.${userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            current_plan: plan,
            subscription_status: a.status,
            current_period_end: a.renews_at ?? a.ends_at ?? null,
            ls_customer_id: String(a.customer_id ?? ""),
          }),
        });
        return new Response("ok");
      },
    },
  },
});
