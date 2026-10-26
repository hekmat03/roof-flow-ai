/**
 * POST /api/auth/signup — create an account (email + password).
 * The account is optional everywhere else in the app: the dashboard, all four
 * simulators and the CRM keep working signed-out.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createSessionToken, isSecureRequest, sessionCookieHeader, signUp } from "../../lib/auth";
import { clientIp, isSameOrigin, json, rateLimit, readJson } from "../../lib/http";

interface Body {
  email?: unknown;
  password?: unknown;
}

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const limit = rateLimit(`signup:${clientIp(request)}`, 10, 10 * 60 * 1000);
        if (!limit.allowed) {
          return json({ ok: false, error: "rate_limited", message: "Too many sign-up attempts — try again shortly." }, 429, {
            "Retry-After": String(limit.retryAfterSec),
          });
        }

        const body = await readJson<Body>(request);
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body?.password === "string" ? body.password : "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return json({ ok: false, error: "validation", field: "email", message: "Enter a valid email address." }, 400);
        }
        if (password.length < 8) {
          return json({ ok: false, error: "validation", field: "password", message: "Use at least 8 characters." }, 400);
        }

        const result = await signUp(email, password);
        if (!result.ok) return json({ ok: false, error: result.error, message: result.message }, result.status);

        const headers: Record<string, string> = {};
        if (!result.needsConfirmation) {
          headers["Set-Cookie"] = sessionCookieHeader(
            createSessionToken(result.user.id, result.user.email),
            isSecureRequest(request)
          );
        }
        return json(
          {
            ok: true,
            user: result.user,
            signedIn: !result.needsConfirmation,
            needsConfirmation: Boolean(result.needsConfirmation),
            message: result.needsConfirmation
              ? "Account created. Check your inbox to confirm the email, then sign in."
              : "Account created. You are signed in on the Free plan.",
          },
          201,
          headers
        );
      },
    },
  },
});
