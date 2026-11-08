// Which sidebar tabs each plan can open. Nothing is deleted: locked and hidden tabs stay in the code.
export type PlanId = 'free' | 'starter' | 'pro';

/** Tabs are visible in navigation; ACCESS controls which plans may open them. */
export const HIDDEN_TABS: readonly string[] = [];

const ACCESS: Record<PlanId, string[]> = {
  free:    ['agent1', 'pricing', 'billing', 'config'],
  starter: ['agent1', 'dashboard', 'crm', 'pricing', 'billing', 'config'],
  pro:     ['agent1', 'dashboard', 'crm', 'agent2', 'agent3', 'agent4', 'pricing', 'billing', 'config', 'prompts'],
};

const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];
export const PLAN_NAMES: Record<PlanId, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' };

export const isHidden = (tab: string): boolean => HIDDEN_TABS.includes(tab);

export const canAccess = (plan: PlanId, tab: string): boolean =>
  !isHidden(tab) && ACCESS[plan].includes(tab);

export const requiredPlan = (tab: string): PlanId | null =>
  PLAN_ORDER.find((p) => ACCESS[p].includes(tab)) ?? null;

export const upgradeLabel = (plan: PlanId): string => (plan === 'free' ? 'Upgrade' : 'Upgrade to Pro');

export const fallbackTab = (): string => 'agent1';
