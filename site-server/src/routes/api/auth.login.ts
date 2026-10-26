/**
 * POST /api/auth/login — email + password sign-in.
 * Rate limited per IP and per email to slow credential stuffing.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createSessionToken, isSecureRequest, sessionCookieHeader, signIn } from "../../lib/auth";
import { clientIp, isSameOrigin, json, rateLimit, readJson } from "../../lib/http";

interface Body {
  email?: unknown;
  password?: unknown;
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const body = await readJson<Body>(request);
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body?.password === "string" ? body.password : "";

        const byIp = rateLimit(`login-ip:${clientIp(request)}`, 20, 10 * 60 * 1000);
        const byEmail = rateLimit(`login-email:${email}`, 8, 10 * 60 * 1000);
        if (!byIp.allowed || !byEmail.allowed) {
          const retry = Math.max(byIp.retryAfterSec, byEmail.retryAfterSec);
          return json({ ok: false, error: "rate_limited", message: "Too many sign-in attempts — try again shortly." }, 429, {
            "Retry-After": String(retry),
          });
        }
        if (!email || !password) {
          return json({ ok: false, error: "validation", message: "Enter your email and password." }, 400);
        }

        const result = await signIn(email, password);
        if (!result.ok) return json({ ok: false, error: result.error, message: result.message }, result.status);

        return json(
          { ok: true, user: result.user, signedIn: true },
          200,
          {
            "Set-Cookie": sessionCookieHeader(
              createSessionToken(result.user.id, result.user.email),
              isSecureRequest(request)
            ),
          }
        );
      },
    },
  },
});
