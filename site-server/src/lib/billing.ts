/**
 * Stripe integration — fully coded, deliberately dormant.
 * ---------------------------------------------------------------------------
 * The owner has no Stripe account yet, so NOTHING here may pretend payments
 * work. Every entry point first asks `paymentsActivated()`, which is true only
 * when a real `STRIPE_SECRET_KEY` exists in this server's environment. Without
 * it, each route returns a clean `{ paymentsActivated: false }` payload and no
 * network call is made anywhere.
 *
 * The moment the owner pastes a secret key (and optionally
 * STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO), the same code
 * paths start working — no code change needed.
 *
 * Signature verification uses the official `stripe` library and the RAW request
 * body, which is the only correct way to verify a webhook.
 */
import Stripe from "stripe";
import { adminFetch, isConfigured, SupabaseError } from "./supabase-admin";
import { isPlanId, PLANS, planFromPriceId, priceIdForPlan, type PlanId } from "./plans";
import { periodEnd, periodStart } from "./usage";

export const PROFILES_TABLE = "profiles";
export const WEBHOOK_EVENTS_TABLE = "webhook_events";

export const stripeSecretKey = (): string => (process.env.STRIPE_SECRET_KEY ?? "").trim();
export const stripeWebhookSecret = (): string => (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

/** The single switch that separates "coded" from "live". */
export const paymentsActivated = (): boolean => stripeSecretKey().length > 0;

let cached: Stripe | null = null;
/** The Stripe client. Throws if called without a key — callers must check first. */
export const stripeClient = (): Stripe => {
  const key = stripeSecretKey();
  if (!key) throw new Error("stripe_not_activated");
  cached ??= new Stripe(key, { appInfo: { name: "RoofFlow AI" } });
  return cached;
};

/** The response every keyless route returns. Deliberately identical everywhere. */
export const notActivated = (what: string) => ({
  paymentsActivated: false,
  area: what,
  message:
    "Payments are not activated yet. No Stripe account is connected, so no checkout can be created and no card can be charged.",
  activateBy: [
    "Create a Stripe account and add STRIPE_SECRET_KEY to this site's environment secrets.",
    "Optionally add STRIPE_WEBHOOK_SECRET (webhook signing secret) so subscription events are verified.",
    "Optionally set STRIPE_PRICE_STARTER and STRIPE_PRICE_PRO to the real price ids from the Stripe dashboard.",
  ],
});

/* -------------------------------------------------------------------------- */
/* Profile helpers                                                             */
/* -------------------------------------------------------------------------- */

export interface ProfileRow {
  user_id: string;
  current_plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export const getProfile = async (userId: string): Promise<ProfileRow | null> => {
  if (!isConfigured()) return null;
  const res = await adminFetch(
    `/rest/v1/${PROFILES_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as ProfileRow[];
  return rows[0] ?? null;
};

/**
 * Upsert a profile row. Service-key only: this is the sole writer of plan state,
 * which is what makes the plan tamper-proof from the browser.
 */
export const upsertProfile = async (patch: Partial<ProfileRow> & { user_id: string }): Promise<boolean> => {
  const res = await adminFetch(`/rest/v1/${PROFILES_TABLE}?on_conflict=user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return res.ok;
};

/* -------------------------------------------------------------------------- */
/* Checkout / portal                                                           */
/* -------------------------------------------------------------------------- */

export interface CheckoutArgs {
  userId: string;
  plan: PlanId;
  /** Origin of the request, used to build the success/cancel URLs. */
  origin: string;
  email?: string | null;
}

export type CheckoutResult =
  | { paymentsActivated: false }
  | { paymentsActivated: true; url: string | null }
  | { paymentsActivated: true; error: string; message: string };

/**
 * Create a Checkout Session for a paid plan.
 *
 * Guards, all server-side:
 *  - the plan id is validated against the catalogue (a forged plan is ignored),
 *  - the price id comes from the server catalogue, never from the request,
 *  - a user who already has an active paid subscription is sent to the portal
 *    instead, so a second subscription cannot be created by accident.
 */
export const createCheckoutSession = async (args: CheckoutArgs): Promise<CheckoutResult> => {
  if (!paymentsActivated()) return { paymentsActivated: false };
  if (!isPlanId(args.plan) || args.plan === "free") {
    return { paymentsActivated: true, error: "invalid_plan", message: "Choose the Starter or Pro plan." };
  }
  const priceId = priceIdForPlan(args.plan);
  if (!priceId) {
    return { paymentsActivated: true, error: "no_price_id", message: `No Stripe price is configured for ${PLANS[args.plan].name}.` };
  }

  const profile = await getProfile(args.userId).catch(() => null);
  const alreadySubscribed =
    profile?.stripe_customer_id &&
    profile.subscription_status &&
    ["active", "trialing", "past_due"].includes(profile.subscription_status);
  if (alreadySubscribed) {
    return {
      paymentsActivated: true,
      error: "already_subscribed",
      message: "This account already has a subscription. Use Manage billing to change plans.",
    };
  }

  const stripe = stripeClient();
  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.email ?? undefined,
      metadata: { user_id: args.userId },
    });
    customerId = customer.id;
    await upsertProfile({ user_id: args.userId, stripe_customer_id: customerId }).catch(() => false);
  }

  const base = args.origin.replace(/\/+$/, "");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/app/?billing=success&plan=${args.plan}`,
    cancel_url: `${base}/app/?billing=cancelled`,
    client_reference_id: args.userId,
    metadata: { user_id: args.userId, plan: args.plan },
  });
  return { paymentsActivated: true, url: session.url };
};

export const createPortalSession = async (args: {
  userId: string;
  origin: string;
}): Promise<{ paymentsActivated: boolean; url?: string | null; error?: string; message?: string }> => {
  if (!paymentsActivated()) return notActivated("billing_portal");
  const profile = await getProfile(args.userId).catch(() => null);
  if (!profile?.stripe_customer_id) {
    return {
      paymentsActivated: true,
      error: "no_customer",
      message: "There is no billing account for this user yet. Start a subscription first.",
    };
  }
  const session = await stripeClient().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${args.origin.replace(/\/+$/, "")}/app/?billing=portal_return`,
  });
  return { paymentsActivated: true, url: session.url };
};

/* -------------------------------------------------------------------------- */
/* Webhook                                                                     */
/* -------------------------------------------------------------------------- */

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Idempotency: returns false when this event id was already processed. */
const claimEvent = async (eventId: string): Promise<boolean> => {
  if (!isConfigured()) return false;
  const res = await adminFetch(`/rest/v1/${WEBHOOK_EVENTS_TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stripe_event_id: eventId, processed_at: new Date().toISOString() }),
  });
  if (res.ok) return true;
  const body = (await res.text()).slice(0, 200);
  if (res.status === 409 || /duplicate key|23505/i.test(body)) return false;
  throw new SupabaseError(res.status, body);
};

interface SubscriptionLike {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string> | null;
  items?: { data: Array<{ price?: { id?: string } | null }> };
}

const userIdFor = async (customerId: string, hint?: string | null): Promise<string | null> => {
  if (hint) return hint;
  if (!isConfigured()) return null;
  const res = await adminFetch(
    `/rest/v1/${PROFILES_TABLE}?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ user_id: string }>;
  return rows[0]?.user_id ?? null;
};

const isoFromUnix = (v: number | undefined): string | null =>
  typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;

const applySubscription = async (sub: SubscriptionLike): Promise<Record<string, unknown>> => {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planFromPriceId(priceId);
  const userId = await userIdFor(sub.customer, sub.metadata?.user_id ?? null);
  if (!userId) return { applied: false, reason: "unknown_customer" };

  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const targetPlan: PlanId = active && plan ? plan : "free";
  return {
    applied: await upsertProfile({
      user_id: userId,
      stripe_customer_id: sub.customer,
      current_plan: targetPlan,
      subscription_status: sub.status,
      price_id: priceId,
      current_period_start: isoFromUnix(sub.current_period_start) ?? `${periodStart()}T00:00:00.000Z`,
      current_period_end: isoFromUnix(sub.current_period_end) ?? `${periodEnd(periodStart())}T00:00:00.000Z`,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    }),
    user_id_hash: undefined,
  };
};

/**
 * Verify and process a Stripe webhook.
 *
 * The RAW body is required — a re-serialised body changes the signature. When no
 * webhook secret is configured we cannot verify, so we refuse the delivery
 * (503) rather than trusting unverified input; Stripe will retry.
 */
export const handleWebhook = async (rawBody: string, signature: string | null): Promise<WebhookOutcome> => {
  // `constructEventAsync` (not the sync variant): Bun and other SubtleCrypto
  // runtimes cannot do synchronous HMAC here.
  if (!paymentsActivated()) {
    return { status: 503, body: notActivated("stripe_webhook") };
  }
  const secret = stripeWebhookSecret();
  if (!secret) {
    return {
      status: 503,
      body: {
        paymentsActivated: true,
        error: "webhook_secret_missing",
        message:
          "STRIPE_WEBHOOK_SECRET is not set, so this delivery cannot be verified and will not be trusted. Stripe will retry once it is configured.",
      },
    };
  }
  if (!signature) {
    return { status: 400, body: { error: "missing_signature" } };
  }

  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    // Never echo the body or the secret on a failed verification.
    return { status: 400, body: { error: "invalid_signature" } };
  }

  try {
    const first = await claimEvent(event.id);
    if (!first) return { status: 200, body: { received: true, duplicate: true } };
  } catch {
    return { status: 500, body: { error: "event_store_unavailable" } };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
        if (userId) {
          await upsertProfile({
            user_id: userId,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
            subscription_status: "active",
            current_plan: isPlanId(session.metadata?.plan) ? session.metadata.plan : "starter",
            current_period_start: `${periodStart()}T00:00:00.000Z`,
            current_period_end: `${periodEnd(periodStart())}T00:00:00.000Z`,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as SubscriptionLike;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await applySubscription({ ...sub, status });
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as { customer?: string; subscription?: string };
        const userId = invoice.customer ? await userIdFor(invoice.customer) : null;
        if (userId) {
          await upsertProfile({
            user_id: userId,
            subscription_status: event.type === "invoice.paid" ? "active" : "past_due",
          });
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged, never trusted for state.
        break;
    }
  } catch {
    return { status: 500, body: { error: "handler_failed" } };
  }

  return { status: 200, body: { received: true } };
};

/**
 * Local-only verification harness: builds a valid `Stripe-Signature` header for
 * a payload using the official library, so the verifier above can be exercised
 * end-to-end in tests without any Stripe account, network call, or real charge.
 */
export const buildTestSignature = (
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000)
): Promise<string> => Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, timestamp });
