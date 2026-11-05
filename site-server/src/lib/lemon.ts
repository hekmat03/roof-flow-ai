/**
 * Lemon Squeezy billing — webhook verification, entitlement and checkout links.
 * ---------------------------------------------------------------------------
 * This is the live-site port of the app repo's `api/_lib/lemon.ts`. It is kept
 * apart from the HTTP route so every rule below can be exercised offline: the
 * only collaborator is a `ProfilesStore`, which the tests replace with an
 * in-memory fake (no network, no database, no real secret).
 *
 * Security properties, all deliberate:
 *  - the signature is an HMAC-SHA256 of the RAW request body, compared in
 *    constant time (`timingSafeEqual`) — a re-serialised body would not match;
 *  - nothing here trusts the request for identity beyond a UUID we ourselves
 *    put in the checkout link (`checkout[custom][user_id]`), or the buyer's
 *    email as a fallback for purchases made outside the app;
 *  - the plan is derived from the variant id in the event, never from the body
 *    of a browser request;
 *  - an unconfigured deployment answers 503 with a clear message instead of
 *    crashing or silently accepting events it cannot verify.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminFetch, isConfigured } from "./supabase-admin";
import { isPlanId, type PlanId } from "./plans";

/** Table that holds plan state. Service-role only — never written by a browser. */
export const PROFILES_TABLE = "profiles";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Configuration (names match the app repo's .env.example, "Step 3")           */
/* -------------------------------------------------------------------------- */

export const lemonWebhookSecret = (): string => (process.env.LS_WEBHOOK_SECRET ?? "").trim();

/** Lemon Squeezy variant id for a paid plan, straight from the environment. */
export const variantIdForPlan = (plan: PlanId): string =>
  plan === "starter"
    ? (process.env.LS_VARIANT_STARTER ?? "").trim()
    : plan === "pro"
      ? (process.env.LS_VARIANT_PRO ?? "").trim()
      : "";

/** Variant id (env) -> plan. Unknown or empty -> null. */
export const planFromVariant = (variantId: unknown): PlanId | null => {
  const v = String(variantId ?? "").trim();
  if (!v) return null;
  if (v === variantIdForPlan("starter")) return "starter";
  if (v === variantIdForPlan("pro")) return "pro";
  return null;
};

/** Hosted-checkout buy link for a paid plan (set in env), or null. */
export const checkoutUrlForPlan = (plan: PlanId): string | null => {
  const key =
    plan === "starter"
      ? "LS_CHECKOUT_URL_STARTER"
      : plan === "pro"
        ? "LS_CHECKOUT_URL_PRO"
        : "";
  const url = key ? (process.env[key] ?? "").trim() : "";
  return url.startsWith("https://") ? url : null;
};

/**
 * Payments are "on" only when a purchase can actually be fulfilled: the buyer
 * must reach checkout (buy links), and the webhook must be able to verify the
 * event (secret) and map the paid variant back to a plan (variant ids). Without
 * the variant ids a customer would pay and never be upgraded.
 */
export const lemonPaymentsActivated = (): boolean =>
  Boolean(
    lemonWebhookSecret() &&
      variantIdForPlan("starter") &&
      variantIdForPlan("pro") &&
      checkoutUrlForPlan("starter") &&
      checkoutUrlForPlan("pro")
  );

/** The webhook needs the signing secret *and* a database to write plan state to. */
export const lemonWebhookReady = (): boolean => Boolean(lemonWebhookSecret()) && isConfigured();

/* -------------------------------------------------------------------------- */
/* Signature                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Constant-time check of the `X-Signature` header (HMAC-SHA256 of the RAW body,
 * hex). `Buffer.from(x, "hex")` never throws — it silently truncates malformed
 * input, which the length check then rejects.
 */
export const validSignature = (
  raw: Uint8Array | string,
  header: string | null | undefined,
  secret: string
): boolean => {
  if (!header || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const given = Buffer.from(header.trim(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/* -------------------------------------------------------------------------- */
/* Entitlement                                                                 */
/* -------------------------------------------------------------------------- */

/** The plan a stored profile row is worth right now. */
export const effectivePlan = (
  p: Pick<ProfileState, "current_plan" | "subscription_status" | "current_period_end"> | null,
  now = Date.now()
): PlanId => {
  if (!p || !isPlanId(p.current_plan) || p.current_plan === "free") return "free";
  const status = p.subscription_status ?? "";
  if (["expired", "unpaid", "paused", "none"].includes(status)) return "free";
  if (status === "cancelled") {
    const end = p.current_period_end ? Date.parse(p.current_period_end) : 0;
    return end > now ? p.current_plan : "free";
  }
  return p.current_plan;
};

/**
 * What a Lemon Squeezy subscription entitles the user to right now.
 * `unmapped` = the subscription is paid but its variant is not in LS_VARIANT_*.
 */
export const entitlement = (
  a: Record<string, unknown>,
  now = Date.now()
): PlanId | "unmapped" => {
  const status = String(a.status ?? "");
  const variantPlan = planFromVariant(a.variant_id);
  const endsAt = a.ends_at ? Date.parse(String(a.ends_at)) : 0;

  // past_due keeps access while Lemon Squeezy retries the card.
  if (["active", "on_trial", "past_due"].includes(status)) return variantPlan ?? "unmapped";
  // Cancelled = no renewal, but the customer paid for the current period.
  if (status === "cancelled") return endsAt > now ? (variantPlan ?? "unmapped") : "free";
  // expired, unpaid, paused, anything unknown: fail closed.
  return "free";
};

export interface ProfileState {
  ls_updated_at?: string | null;
  ls_subscription_id?: string | null;
  current_plan?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
}

/**
 * An old subscription's "expired" event can arrive after the customer bought a
 * new one. It describes a different subscription than the one the profile
 * tracks, so it must not wipe a live entitlement.
 */
export const isSupersededEvent = (
  existing: ProfileState | null,
  incomingSubscriptionId: string | null,
  incomingPlan: PlanId,
  now = Date.now()
): boolean => {
  if (!existing?.ls_subscription_id || !incomingSubscriptionId) return false;
  if (existing.ls_subscription_id === incomingSubscriptionId) return false;
  if (incomingPlan !== "free") return false; // a newer paid sub legitimately replaces the old one
  return effectivePlan(existing, now) !== "free";
};

/* -------------------------------------------------------------------------- */
/* Store (the only side effect this module has)                                */
/* -------------------------------------------------------------------------- */

export interface ProfilesStore {
  /** `profiles.email` -> `user_id` (used when the checkout link had no user id). */
  findUserIdByEmail(email: string): Promise<string | null>;
  /** Current subscription state for a user, or null when there is no row. */
  readState(userId: string): Promise<ProfileState | null>;
  /** Apply a patch; `updated` is the number of rows changed. */
  writePlan(userId: string, patch: Record<string, unknown>): Promise<{ updated: number; error: string | null }>;
}

const enc = encodeURIComponent;

/** PostgREST-backed store. Uses the service key, so it is the only plan writer. */
export const supabaseProfilesStore = (): ProfilesStore => ({
  findUserIdByEmail: async (email) => {
    const res = await adminFetch(
      `/rest/v1/${PROFILES_TABLE}?email=eq.${enc(email)}&select=user_id&limit=1`
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ user_id?: string }>;
    return rows[0]?.user_id ?? null;
  },
  readState: async (userId) => {
    const res = await adminFetch(
      `/rest/v1/${PROFILES_TABLE}?user_id=eq.${enc(userId)}` +
        `&select=ls_updated_at,ls_subscription_id,current_plan,subscription_status,current_period_end&limit=1`
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as ProfileState[];
    return rows[0] ?? null;
  },
  writePlan: async (userId, patch) => {
    const res = await adminFetch(`/rest/v1/${PROFILES_TABLE}?user_id=eq.${enc(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    const text = await res.text();
    if (!res.ok) return { updated: 0, error: `${String(res.status)} ${text.slice(0, 200)}` };
    let rows: unknown = [];
    try {
      rows = text ? (JSON.parse(text) as unknown) : [];
    } catch {
      rows = [];
    }
    return { updated: Array.isArray(rows) ? rows.length : 0, error: null };
  },
});

/* -------------------------------------------------------------------------- */
/* Event -> profile                                                            */
/* -------------------------------------------------------------------------- */

export interface LemonEvent {
  meta?: { event_name?: unknown; custom_data?: { user_id?: unknown } | null };
  data?: { id?: unknown; attributes?: Record<string, unknown> };
}

export interface LemonResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): LemonResult => ({ status: 200, body: { ok: true, ...body } });

/**
 * Applies one verified webhook event to `profiles`.
 * Every non-error outcome is a 200 so Lemon Squeezy does not retry something that
 * can never succeed (unknown user, unmapped variant); only a real write failure
 * returns 500.
 */
export const applyLemonEvent = async (
  store: ProfilesStore,
  evt: LemonEvent,
  now = Date.now()
): Promise<LemonResult> => {
  const eventName = String(evt.meta?.event_name ?? "");
  if (!eventName.startsWith("subscription_") || eventName.startsWith("subscription_payment_")) {
    return ok({ ignored: eventName });
  }

  const a = evt.data?.attributes ?? {};
  const subscriptionId = evt.data?.id != null ? String(evt.data.id) : null;

  // 1. Who is this for? Prefer the user id we put in the checkout link, fall
  //    back to the buyer's email for purchases made outside the app.
  let userId = String(evt.meta?.custom_data?.user_id ?? "");
  if (!UUID_RE.test(userId)) {
    const email = String(a.user_email ?? "").trim().toLowerCase();
    userId = email ? ((await store.findUserIdByEmail(email)) ?? "") : "";
  }
  if (!UUID_RE.test(userId)) return ok({ ignored: "no_user" });

  // 2. Out-of-order / superseded protection.
  const existing = await store.readState(userId);
  const updatedAt = String(a.updated_at ?? new Date(now).toISOString());
  if (
    existing?.ls_subscription_id === subscriptionId &&
    existing?.ls_updated_at &&
    Date.parse(updatedAt) < Date.parse(existing.ls_updated_at)
  ) {
    return ok({ ignored: "stale" });
  }

  const plan = entitlement(a, now);
  if (plan === "unmapped") {
    // Never guess a plan: a wrong guess gives away the product, and this is the
    // symptom of LS_VARIANT_STARTER / LS_VARIANT_PRO being unset or mismatched.
    console.error("lemon-webhook: variant not mapped (check LS_VARIANT_STARTER / LS_VARIANT_PRO):", a.variant_id);
    return ok({ ignored: "unmapped_variant" });
  }

  if (isSupersededEvent(existing, subscriptionId, plan, now)) {
    return ok({ ignored: "superseded" });
  }

  // 3. Write. Only this code path (service key) can change a user's plan.
  const urls = (a.urls ?? {}) as { customer_portal?: unknown };
  const portal = typeof urls.customer_portal === "string" ? urls.customer_portal : null;
  const { updated, error } = await store.writePlan(userId, {
    current_plan: plan,
    subscription_status: String(a.status ?? "none"),
    ls_customer_id: a.customer_id != null ? String(a.customer_id) : null,
    ls_subscription_id: subscriptionId,
    ls_variant_id: a.variant_id != null ? String(a.variant_id) : null,
    current_period_end: (a.renews_at ?? a.ends_at ?? null) as string | null,
    cancel_at_period_end: Boolean(a.cancelled),
    ls_portal_url: portal,
    ls_updated_at: updatedAt,
    updated_at: new Date(now).toISOString(),
  });

  if (error) {
    console.error("lemon-webhook db error:", error);
    return { status: 500, body: { ok: false, error: "db_error" } };
  }
  if (updated === 0) {
    // Paid but no profile row: never report success for a write that changed nothing.
    console.error("lemon-webhook: no profile row for user", userId);
    return ok({ ignored: "no_profile" });
  }

  return ok({ plan });
};

/* -------------------------------------------------------------------------- */
/* HTTP-facing entry point (used by the route, exercised by the tests)          */
/* -------------------------------------------------------------------------- */

export interface LemonWebhookOptions {
  /** Injectable store (tests pass an in-memory fake). */
  store?: ProfilesStore | null;
  now?: number;
}

/**
 * Verify and apply one webhook delivery.
 *
 * Status codes: 200 applied/ignored, 400 unverifiable payload, 401 bad
 * signature, 503 not configured (secret or database missing), 500 a real write
 * failure. Nothing here echoes the secret or the body back.
 */
export const handleLemonWebhook = async (
  rawBody: Uint8Array | string,
  signature: string | null | undefined,
  options: LemonWebhookOptions = {}
): Promise<LemonResult> => {
  const secret = lemonWebhookSecret();
  if (!secret) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "not_configured",
        message:
          "LS_WEBHOOK_SECRET is not set, so this delivery cannot be verified and is refused. Lemon Squeezy retries automatically once the secret is saved.",
      },
    };
  }
  const store = options.store ?? (isConfigured() ? supabaseProfilesStore() : null);
  if (!store) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "database_not_configured",
        message:
          "The webhook secret is set but the database is not, so a paid plan could not be written. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
    };
  }

  if (!validSignature(rawBody, signature, secret)) {
    return { status: 401, body: { ok: false, error: "bad_signature" } };
  }

  const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { status: 400, body: { ok: false, error: "bad_json" } };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: 400, body: { ok: false, error: "bad_payload" } };
  }
  const evt = parsed as LemonEvent;
  if (typeof evt.meta?.event_name !== "string" || !evt.meta.event_name) {
    return { status: 400, body: { ok: false, error: "bad_payload" } };
  }

  return applyLemonEvent(store, evt, options.now ?? Date.now());
};

/**
 * Build a checkout link for a plan: the hosted buy link with the buyer's email
 * and user id pre-filled, so the webhook can identify the account even when the
 * customer pays with a different email than they signed up with.
 */
export const buildCheckoutLink = (plan: PlanId, args: { userId?: string | null; email?: string | null } = {}): string | null => {
  const base = checkoutUrlForPlan(plan);
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (args.email) url.searchParams.set("checkout[email]", args.email);
  if (args.userId) url.searchParams.set("checkout[custom][user_id]", args.userId);
  return url.toString();
};
