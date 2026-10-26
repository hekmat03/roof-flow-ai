/**
 * Authentication — email + password, backed by Supabase GoTrue.
 * ---------------------------------------------------------------------------
 * Deliberate design choice: the browser NEVER holds a Supabase key.
 *
 * The only key available to this deployment is the SERVICE role key, which must
 * never be shipped to a browser (it bypasses row-level security). So there is no
 * client-side supabase-js client here. Instead this server talks to GoTrue with
 * the service key and hands the browser a signed, HttpOnly cookie containing
 * nothing but a user id, an email and an expiry. Signing uses HMAC-SHA256 keyed
 * with the service key itself, so no extra secret has to be provisioned.
 *
 * Consequences, stated plainly:
 *  - the app shell, all four simulators and the CRM stay usable with NO login,
 *    exactly as before (the owner asked for that);
 *  - only the account/billing/usage areas require a session;
 *  - a client that tampers with its cookie only invalidates its own signature.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminFetch, isConfigured, supabaseEnv } from "./supabase-admin";

export const SESSION_COOKIE = "rf_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  userId: string;
  email: string;
  exp: number;
}

const sign = (data: string): string => {
  const { serviceKey } = supabaseEnv();
  return createHmac("sha256", `roofflow-session-v1:${serviceKey}`).update(data).digest("base64url");
};

export const createSessionToken = (userId: string, email: string): string => {
  const payload: Session = { userId, email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
};

export const verifySessionToken = (token: string | null | undefined): Session | null => {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (!parsed.userId || parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};

/** Parse a Cookie header. */
export const readCookie = (request: Request, name: string): string | null => {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
};

/** The signed-in user for a request, or null. Never throws. */
export const sessionFromRequest = (request: Request): Session | null =>
  verifySessionToken(readCookie(request, SESSION_COOKIE));

export const sessionCookieHeader = (token: string, secure: boolean): string =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(SESSION_TTL_SEC)}${secure ? "; Secure" : ""}`;

export const clearCookieHeader = (): string =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const isSecureRequest = (request: Request): boolean => {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
};

/* -------------------------------------------------------------------------- */
/* GoTrue calls (service key stays here)                                       */
/* -------------------------------------------------------------------------- */

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthResult =
  | { ok: true; user: AuthUser; /** True when GoTrue requires email confirmation first. */ needsConfirmation?: boolean }
  | { ok: false; status: number; error: string; message: string };

interface GoTrueUser {
  id?: string;
  email?: string;
  identities?: unknown[];
  confirmation_sent_at?: string;
}

interface GoTrueSessionResponse {
  access_token?: string;
  user?: GoTrueUser;
  id?: string;
  email?: string;
  error?: string;
  error_description?: string;
  msg?: string;
}

const goTrue = async (path: string, body: unknown): Promise<{ status: number; json: GoTrueSessionResponse }> => {
  const res = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
  let json: GoTrueSessionResponse = {};
  try {
    json = (await res.json()) as GoTrueSessionResponse;
  } catch {
    json = {};
  }
  return { status: res.status, json };
};

const messageFor = (status: number, json: GoTrueSessionResponse): string => {
  const raw = json.error_description ?? json.msg ?? json.error ?? "";
  if (/already registered|already exists/i.test(raw)) return "That email is already registered — sign in instead.";
  if (/invalid login credentials/i.test(raw)) return "Email or password is incorrect.";
  if (/password/i.test(raw) && /least|short|weak/i.test(raw)) return "Choose a longer password (at least 8 characters).";
  if (status === 429) return "Too many attempts — please wait a moment and try again.";
  return raw || "That didn't work. Please try again.";
};

const asUser = (j: GoTrueSessionResponse): AuthUser | null => {
  const u = j.user ?? (j.id ? { id: j.id, email: j.email } : undefined);
  if (!u?.id || !u.email) return null;
  return { id: u.id, email: u.email };
};

/**
 * Create an account.
 *
 * Uses the ADMIN create endpoint rather than the public `/auth/v1/signup`. This
 * project has email confirmation switched on, which is doubly wrong for this
 * business: every public signup would send a confirmation email even though the
 * product has no email by design, and the free tier's email rate limit (~3/hour)
 * then 429s everyone after the third attempt — while the "successful" signups
 * before that would be stranded unconfirmed, waiting for a mail that never comes.
 * Admin-create with `email_confirm: true` yields an immediately usable account,
 * sends nothing, and keeps the AuthResult shape identical for route and UI.
 */
export const signUp = async (email: string, password: string): Promise<AuthResult> => {
  if (!isConfigured()) {
    return { ok: false, status: 503, error: "auth_not_configured", message: "Accounts are unavailable: the database is not connected." };
  }
  const res = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  let raw: GoTrueSessionResponse = {};
  try {
    raw = (await res.json()) as GoTrueSessionResponse;
  } catch {
    raw = {};
  }
  const user = asUser(raw);
  if (!res.ok || !user) {
    const text = JSON.stringify(raw);
    if (res.status === 422 || /already registered|already exists|email_exists/i.test(text)) {
      return { ok: false, status: 409, error: "already_registered", message: "That email is already registered — sign in instead." };
    }
    return {
      ok: false,
      status: res.status >= 400 ? res.status : 400,
      error: "signup_failed",
      message: messageFor(res.status, raw),
    };
  }
  await ensureProfile(user.id);
  return { ok: true, user, needsConfirmation: false };
};

/** Sign in with a password. */
export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  if (!isConfigured()) {
    return { ok: false, status: 503, error: "auth_not_configured", message: "Accounts are unavailable: the database is not connected." };
  }
  const { status, json } = await goTrue("/auth/v1/token?grant_type=password", { email, password });
  const user = asUser(json);
  if (status >= 400 || !user?.email) {
    return { ok: false, status: status >= 400 ? status : 401, error: "login_failed", message: messageFor(status, json) };
  }
  await ensureProfile(user.id);
  return { ok: true, user };
};

/** Create the profile row if it is missing. Never fatal. */
export const ensureProfile = async (userId: string): Promise<boolean> => {
  try {
    const res = await adminFetch("/rest/v1/profiles?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, current_plan: "free", subscription_status: "none" }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/** Revoke the refresh token on sign-out (best effort; the cookie is the session). */
export const revokeSession = async (): Promise<void> => {
  // Our cookie carries no Supabase token, so there is nothing server-side to
  // revoke: dropping the cookie ends the session. Kept as a named no-op so the
  // intent is explicit rather than missing.
  await Promise.resolve();
};
