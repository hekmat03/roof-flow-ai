
 // Which sidebar tabs each plan can open. Nothing is deleted: locked tabs stay in the code.
export type PlanId = 'free' | 'starter' | 'pro';

const ACCESS: Record<PlanId, string[]> = {
  free:    ['dashboard', 'agent1', 'pricing', 'billing', 'config', 'prompts'],
  starter: ['dashboard', 'agent1', 'crm', 'pricing', 'billing', 'config', 'prompts'],
  pro:     ['dashboard', 'agent1', 'agent2', 'agent3', 'agent4', 'crm', 'pricing', 'billing', 'config', 'prompts'],
};

export const canAccess = (plan: PlanId, tab: string): boolean => ACCESS[plan].includes(tab);
export const upgradeLabel = (plan: PlanId): string => (plan === 'free' ? 'Upgrade' : 'Upgrade to Pro');
