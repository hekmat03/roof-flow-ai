// Single source of truth for plans, prices and limits.
// The UI renders the server's /api/billing/status response.

export type PlanId = 'free' | 'starter' | 'pro';
export const EMAIL_DAILY_CAP = 100;
export const EMAIL_MONTHLY_CAPS: Record<PlanId, number> = { free: 0, starter: 200, pro: 1000 };

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  conversationsPerMonth: number;
  tagline: string;
  includes: string[];
  capabilities: Record<string, boolean>;
}

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyUsd: 0,
    conversationsPerMonth: 20,
    tagline: 'Try the AI chatbot on your own leads.',
    includes: [
      'AI website chatbot',
      '20 chats per month',
      'Lead capture with validation',
    ],
    capabilities: { chatbot: true, crm: false, otherAgents: false, emailFollowups: false },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthlyUsd: 19,
    conversationsPerMonth: 250,
    tagline: 'Chatbot plus a CRM board for every lead.',
    includes: [
      'Everything in Free',
      '250 chats per month',
      'CRM leads board',
      'Scheduled email follow-ups (200 per month, 100 per day)',
    ],
    capabilities: { chatbot: true, crm: true, otherAgents: false, emailFollowups: true },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUsd: 39,
    conversationsPerMonth: 1000,
    tagline: 'Every feature unlocked.',
    includes: [
      'Everything in Starter',
      '1,000 chats per month',
      'All agents and features',
      'Scheduled email follow-ups (1,000 per month, 100 per day)',
    ],
    capabilities: { chatbot: true, crm: true, otherAgents: true, emailFollowups: true },
  },
};

export const NOT_INCLUDED_ANY_PLAN: string[] = [
  'Phone calls: Agent 2 is a simulation, no telephony provider is connected',
  'SMS is not delivered; no SMS provider is connected',
];

export const isPlanId = (v: unknown): v is PlanId =>
  typeof v === 'string' && (PLAN_ORDER as string[]).includes(v);

export const limitForPlan = (plan: PlanId): number =>
  PLANS[plan].conversationsPerMonth;

/** Lemon Squeezy variant id (env) -> plan. */
export function planFromVariant(variantId: unknown): PlanId | null {
  const v = String(variantId ?? '').trim();
  if (!v) return null;

  if (v === (process.env.LS_VARIANT_STARTER ?? '').trim()) return 'starter';
  if (v === (process.env.LS_VARIANT_PRO ?? '').trim()) return 'pro';

  return null;
}

/** Hosted-checkout buy link for a paid plan (set in env), or null. */
export function checkoutUrlForPlan(plan: PlanId): string | null {
  const key =
    plan === 'starter'
      ? 'LS_CHECKOUT_URL_STARTER'
      : plan === 'pro'
        ? 'LS_CHECKOUT_URL_PRO'
        : '';

  const url = key ? (process.env[key] ?? '').trim() : '';
  return url.startsWith('https://') ? url : null;
}

/**
 * Payments are only "on" when a purchase can actually be fulfilled: a buyer must be
 * able to reach checkout (buy links), and the webhook must be able to verify the
 * event (secret) and map the paid variant back to a plan (variant ids). Without the
 * variant ids a customer would pay and never be upgraded.
 */
export const paymentsActivated = (): boolean =>
  Boolean(
    (process.env.LS_WEBHOOK_SECRET ?? '').trim() &&
    (process.env.LS_VARIANT_STARTER ?? '').trim() &&
    (process.env.LS_VARIANT_PRO ?? '').trim() &&
    checkoutUrlForPlan('starter') &&
    checkoutUrlForPlan('pro'),
  );

export const planCatalog = () => ({
  plans: PLAN_ORDER.map((id) => ({
    ...PLANS[id],
    priceIdConfigured: id === 'free' ? true : checkoutUrlForPlan(id) !== null,
  })),
  notIncluded: NOT_INCLUDED_ANY_PLAN,
});
