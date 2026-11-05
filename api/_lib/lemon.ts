// Lemon Squeezy webhook logic, kept apart from the HTTP handler so it can be
// unit-tested without a network, a database or the Vercel runtime.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { effectivePlan, type ProfileRow } from './billing.js';
import { planFromVariant, type PlanId } from './plans.js';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time check of the X-Signature header (HMAC-SHA256 of the RAW body, hex). */
export function validSignature(
  raw: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  // Buffer.from(x, 'hex') never throws: it silently truncates bad input, which the
  // length check below then rejects.
  const given = Buffer.from(header.trim(), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * What a Lemon Squeezy subscription entitles the user to right now.
 * 'unmapped' = the subscription is paid but its variant is not in LS_VARIANT_*.
 */
export function entitlement(
  a: Record<string, unknown>,
  now = Date.now(),
): PlanId | 'unmapped' {
  const status = String(a.status ?? '');
  const variantPlan = planFromVariant(a.variant_id);
  const endsAt = a.ends_at ? Date.parse(String(a.ends_at)) : 0;

  // past_due keeps access while Lemon Squeezy retries the card.
  if (['active', 'on_trial', 'past_due'].includes(status)) {
    return variantPlan ?? 'unmapped';
  }
  // Cancelled = no renewal, but the customer paid for the current period.
  if (status === 'cancelled') {
    return endsAt > now ? (variantPlan ?? 'unmapped') : 'free';
  }
  // expired, unpaid, paused, anything unknown
  return 'free';
}

type Existing = Pick<
  ProfileRow,
  | 'ls_updated_at'
  | 'ls_subscription_id'
  | 'current_plan'
  | 'subscription_status'
  | 'current_period_end'
>;

/**
 * An old subscription's "expired" event can arrive after the customer has bought a
 * new one. It describes a different subscription than the one the profile tracks,
 * so it must not wipe a live entitlement.
 */
export function isSupersededEvent(
  existing: Existing | null,
  incomingSubscriptionId: string | null,
  incomingPlan: PlanId,
  now = Date.now(),
): boolean {
  if (!existing?.ls_subscription_id || !incomingSubscriptionId) return false;
  if (existing.ls_subscription_id === incomingSubscriptionId) return false;
  if (incomingPlan !== 'free') return false; // a newer paid sub legitimately replaces the old one
  return effectivePlan(existing, now) !== 'free';
}

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
 * Every non-error outcome is a 200 so Lemon Squeezy does not retry things that can
 * never succeed (unknown user, unmapped variant); only real DB failures return 500.
 */
export async function applyLemonEvent(
  admin: SupabaseClient,
  evt: LemonEvent,
  now = Date.now(),
): Promise<LemonResult> {
  const eventName = String(evt.meta?.event_name ?? '');
  if (!eventName.startsWith('subscription_') || eventName.startsWith('subscription_payment_')) {
    return ok({ ignored: eventName });
  }

  const a = evt.data?.attributes ?? {};
  const subscriptionId = evt.data?.id != null ? String(evt.data.id) : null;

  // 1. Who is this for? Prefer the user id we put in the checkout link,
  //    fall back to the buyer's email for purchases made outside the app.
  let userId = String(evt.meta?.custom_data?.user_id ?? '');
  if (!UUID_RE.test(userId)) {
    const email = String(a.user_email ?? '').trim().toLowerCase();
    const { data } = email
      ? await admin.from('profiles').select('user_id').eq('email', email).maybeSingle()
      : { data: null };
    userId = (data as { user_id?: string } | null)?.user_id ?? '';
  }
  if (!UUID_RE.test(userId)) return ok({ ignored: 'no_user' });

  // 2. Out-of-order / superseded protection.
  const { data: existingRow } = await admin
    .from('profiles')
    .select('ls_updated_at, ls_subscription_id, current_plan, subscription_status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  const existing = (existingRow as Existing | null) ?? null;

  const updatedAt = String(a.updated_at ?? new Date(now).toISOString());
  if (
    existing?.ls_subscription_id === subscriptionId &&
    existing?.ls_updated_at &&
    Date.parse(updatedAt) < Date.parse(existing.ls_updated_at)
  ) {
    return ok({ ignored: 'stale' });
  }

  const plan = entitlement(a, now);
  if (plan === 'unmapped') {
    console.error(
      'lemon-webhook: variant not mapped (check LS_VARIANT_STARTER / LS_VARIANT_PRO):',
      a.variant_id,
    );
    return ok({ ignored: 'unmapped_variant' });
  }

  if (isSupersededEvent(existing, subscriptionId, plan, now)) {
    return ok({ ignored: 'superseded' });
  }

  // 3. Write. Only this code path (service role) can change a user's plan.
  const urls = (a.urls ?? {}) as { customer_portal?: string };
  const { data: updated, error } = await admin
    .from('profiles')
    .update({
      current_plan: plan,
      subscription_status: String(a.status ?? 'none'),
      ls_customer_id: a.customer_id != null ? String(a.customer_id) : null,
      ls_subscription_id: subscriptionId,
      ls_variant_id: a.variant_id != null ? String(a.variant_id) : null,
      current_period_end: (a.renews_at ?? a.ends_at ?? null) as string | null,
      cancel_at_period_end: Boolean(a.cancelled),
      ls_portal_url: urls.customer_portal ?? null,
      ls_updated_at: updatedAt,
      updated_at: new Date(now).toISOString(),
    })
    .eq('user_id', userId)
    .select('user_id');

  if (error) {
    console.error('lemon-webhook db error:', error.message);
    return { status: 500, body: { error: 'db error' } };
  }
  if (!updated || updated.length === 0) {
    // Paid but no profile row: never report success for a write that changed nothing.
    console.error('lemon-webhook: no profile row for user', userId);
    return ok({ ignored: 'no_profile' });
  }

  return ok({ plan });
}
