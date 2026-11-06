/**
 * request-auth.ts — "who is calling?" for private (CRM) endpoints.
 * ---------------------------------------------------------------------------
 * The product has two sign-in paths and the CRM can arrive through either:
 *
 *   1. Authorization: Bearer <Supabase access token>
 *        What the React app sends (supabase-js signs users in in the browser).
 *        Verified by asking GoTrue itself, so a forged or expired token fails.
 *        The email must be confirmed, matching the rest of the app.
 *   2. rf_session cookie
 *        The HMAC-signed HttpOnly cookie issued by /api/auth/login.
 *
 * Returns null for "not signed in" — callers answer 401. Never throws.
 *
 * NOTE: both paths depend on the service key (GoTrue call / cookie HMAC), so
 * callers must check `isConfigured()` first. Without a key the cookie HMAC
 * would be keyed with an empty string, which anyone could forge.
 */
import { adminFetch } from "./supabase-admin";
import { sessionFromRequest } from "./auth";
import { isUuid } from "./tenant";

export interface AuthedUser {
  userId: string;
  email: string;
  via: "bearer" | "cookie";
}

const MAX_TOKEN_LENGTH = 4096;

const bearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : "";
};

const verifyBearer = async (token: string): Promise<AuthedUser | null> => {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  try {
    // adminFetch sends the service key as `apikey`; our Authorization header
    // overrides the default one, so GoTrue resolves the USER behind the token.
    const res = await adminFetch("/auth/v1/user", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string; email?: string; email_confirmed_at?: string | null };
    if (!isUuid(user.id) || !user.email || !user.email_confirmed_at) return null;
    return { userId: user.id, email: user.email, via: "bearer" };
  } catch {
    return null;
  }
};

export const authenticate = async (request: Request): Promise<AuthedUser | null> => {
  const token = bearerToken(request);
  if (token !== null) {
    // A request that presents a bearer token is judged on that token alone; a
    // bad one never silently falls back to some other credential.
    return verifyBearer(token);
  }
  const session = sessionFromRequest(request);
  if (!session || !isUuid(session.userId)) return null;
  return { userId: session.userId, email: session.email, via: "cookie" };
};
