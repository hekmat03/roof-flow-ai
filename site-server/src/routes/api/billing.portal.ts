/**
 * POST /api/billing/portal — open the Lemon Squeezy customer portal
 * ("Manage billing"). Uses a fresh portal link from the Lemon Squeezy API when
 * LS_API_KEY is saved, otherwise the link stored by the webhook.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "../../lib/auth";
import { getProfile } from "../../lib/billing";
import { isSameOrigin, json } from "../../lib/http";

const freshPortalUrl = async (subscriptionId: string): Promise<string | null> => {
  const key = (process.env.LS_API_KEY ?? "").trim();
  if (!key) return null;
  try {
    const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { attributes?: { urls?: { customer_portal?: string } } } };
    return data.data?.attributes?.urls?.customer_portal ?? null;
  } catch {
    return null;
  }
};

export const Route = createFileRoute("/api/billing/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const session = sessionFromRequest(request);
        if (!session) {
          return json({ ok: false, error: "not_authenticated", message: "Sign in to manage billing." }, 401);
        }
        const profile = await getProfile(session.userId).catch(() => null);
        if (!profile?.ls_subscription_id) {
          return json({ ok: false, message: "There is no subscription to manage yet." });
        }
        const url = (await freshPortalUrl(profile.ls_subscription_id)) ?? profile.ls_portal_url;
        if (!url) return json({ ok: false, message: "The billing portal is unavailable right now." });
        return json({ ok: true, url });
      },
    },
  },
});
