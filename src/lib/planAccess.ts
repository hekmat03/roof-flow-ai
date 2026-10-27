export type PlanId = 'free' | 'starter' | 'pro';

export type FeatureId =
  | 'agent1'
  | 'agent2'
  | 'agent3'
  | 'agent4'
  | 'crm'
  | 'dashboard'
  | 'config'
  | 'prompts'
  | 'pricing'
  | 'billing';

export const PLAN_LIMITS: Record<PlanId, number> = {
  free: 20,
  starter: 250,
  pro: 1000,
};

export const PLAN_CATALOG = [
  {
    id: 'free' as const,
    name: 'Free',
    priceMonthlyUsd: 0,
    conversationsPerMonth: 20,
    tagline: 'Try it free. No credit card required.',
    cta: 'Get Started Free',
    includes: [
      '20 chats / month',
      'Agent 1 (Chatbot) only',
      'Basic lead capture',
      'No credit card required',
    ],
  },
  {
    id: 'starter' as const,
    name: 'Starter',
    priceMonthlyUsd: 19,
    conversationsPerMonth: 250,
    tagline: 'Chatbot, CRM board, and analytics for growing crews.',
    cta: 'Start Free Trial',
    includes: [
      '250 chats / month',
      'Chatbot + CRM Board',
      'Analytics Dashboard',
      'Google Calendar bookings',
    ],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    priceMonthlyUsd: 39,
    conversationsPerMonth: 1000,
    tagline: 'All four agents and full pipeline control.',
    cta: 'Go Pro',
    includes: [
      '1,000 chats / month',
      'ALL 4 Agents',
      'Full Analytics',
      'Priority Support',
    ],
  },
];

export function isPlanId(v: unknown): v is PlanId {
  return v === 'free' || v === 'starter' || v === 'pro';
}

export function normalizePlan(v: unknown): PlanId {
  return isPlanId(v) ? v : 'free';
}

export function featureAllowed(plan: PlanId, feature: FeatureId): boolean {
  switch (feature) {
    case 'agent1':
    case 'pricing':
    case 'billing':
    case 'config':
    case 'prompts':
      return true;
    case 'crm':
    case 'dashboard':
      return plan === 'starter' || plan === 'pro';
    case 'agent2':
    case 'agent3':
    case 'agent4':
      return plan === 'pro';
    default:
      return false;
  }
}

export function upgradeTarget(plan: PlanId): 'starter' | 'pro' {
  return plan === 'starter' ? 'pro' : 'starter';
}

export function upgradeLabel(plan: PlanId): string {
  return plan === 'pro' ? '' : plan === 'starter' ? 'Upgrade to Pro' : 'Upgrade';
}

export function tabToFeature(tab: string): FeatureId {
  if (
    tab === 'agent1' ||
    tab === 'agent2' ||
    tab === 'agent3' ||
    tab === 'agent4' ||
    tab === 'crm' ||
    tab === 'dashboard' ||
    tab === 'config' ||
    tab === 'prompts' ||
    tab === 'pricing' ||
    tab === 'billing'
  ) {
    return tab;
  }
  return 'dashboard';
}

export function defaultTabForPlan(plan: PlanId): string {
  return plan === 'free' ? 'agent1' : 'dashboard';
}
