import { useBilling } from '../context/BillingContext';
import type { PlanId } from './planAccess';

/**
 * The signed-in user's plan, from the server. While loading (or if billing is
 * unreachable) it is 'free', the safest default; real limits are enforced on
 * the server, so this only controls what the sidebar shows.
 */
export function usePlan(): PlanId {
  return useBilling().plan;
}
