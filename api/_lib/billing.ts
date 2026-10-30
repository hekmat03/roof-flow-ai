// Profile reads, effective plan, usage snapshot.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PLANS,
  isPlanId,
  limitForPlan,
  planCatalog,
  paymentsActivated,
  type PlanId,
} from './plans.js';

export interface ProfileRow {
  user_id: string;
  email: string | null;
  current_plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  ls_customer_id: string | null;
  ls_subscription_id: string | null;
  ls_variant_id: string | null;
  ls_portal_url: string | null;
  ls_updated_at: string | null;
}

export async function getProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data } = await admin
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return (data as ProfileRow | null) ?? null;
}

/** The plan the user is entitled to right now. Never trusts the browser. */
export function effectivePlan(p: ProfileRow | null, now = Date.now()): PlanId {
  if (!p || !isPlanId(p.current_plan) || p.current_plan === 'free') return 'free';

  const status = p.subscription_status ?? '';

  if (['expired', 'unpaid', 'paused', 'none'].includes(status)) return 'free';

  if (status === 'cancelled') {
    const end = p.current_period_end ? Date.parse(p.current_period_end) : 0;
    return end > now ? p.current_plan : 'free';
  }

  return p.current_plan;
}

export const periodStart = (now = new Date()): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

export const periodEnd = (start: string): string => {
  const [y, m] = start.split('-').map(Number);
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};

export async function usageFor(
  admin: SupabaseClient,
  userId: string,
  plan: PlanId,
) {
  const start = periodStart();
  const limit = limitForPlan(plan);

  const { count, error } = await admin
    .from('usage_conversations')
    .select('conversation_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('period_start', start);

  const used = count ?? 0;

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    periodStart: start,
    periodEnd: periodEnd(start),
    storage: error ? 'error' : 'ok',
  };
}

export async function statusPayload(
  admin: SupabaseClient | null,
  user: { id: string; email: string | null } | null,
) {
  const base = {
    paymentsActivated: paymentsActivated(),
    ...planCatalog(),
  };

  if (!admin || !user) {
    return {
      ...base,
      authenticated: false,
      user: null,
      plan: 'free' as PlanId,
      subscription: null,
      usage: null,
    };
  }

  const profile = await getProfile(admin, user.id);
  const plan = effectivePlan(profile);

  return {
    ...base,
    authenticated: true,
    user: { id: user.id, email: user.email ?? '' },
    plan,
    subscription: {
      status: profile?.subscription_status ?? 'none',
      currentPeriodStart: null,
      currentPeriodEnd: profile?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(profile?.cancel_at_period_end),
      hasCustomer: Boolean(profile?.ls_customer_id),
      hasPrice: plan !== 'free',
    },
    usage: await usageFor(admin, user.id, plan),
  };
}

export { PLANS };
