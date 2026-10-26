/**
 * GET  /api/auth/session — who is signed in (from the signed HttpOnly cookie).
 * POST /api/auth/session — sign out (clears the cookie).
 *
 * The response never contains a Supabase token: the browser only ever holds a
 * signed {userId, email, exp} cookie, so there is nothing to steal from it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { clearCookieHeader, sessionFromRequest } from "../../lib/auth";
import { isSameOrigin, json } from "../../lib/http";
import { planForUser, usageSnapshot } from "../../lib/usage";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const session = sessionFromRequest(request);
        if (!session) return json({ ok: true, authenticated: false, user: null });
        const plan = await planForUser(session.userId);
        const usage = await usageSnapshot(session.userId);
        return json({
          ok: true,
          authenticated: true,
          user: { id: session.userId, email: session.email },
          plan,
          usage: { used: usage.used, limit: usage.limit, periodStart: usage.periodStart, periodEnd: usage.periodEnd, storage: usage.storage },
        });
      },

      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        return json({ ok: true, authenticated: false, user: null }, 200, { "Set-Cookie": clearCookieHeader() });
      },
    },
  },
});
