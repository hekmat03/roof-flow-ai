
import { useEffect, useState } from 'react';
import { fetchBillingStatus } from './billingApi';
import type { PlanId } from './planAccess';

// One shared request for the whole app (Layout and App both call usePlan).
let cached: Promise<PlanId | null> | null = null;
const loadPlan = (): Promise<PlanId | null> => {
  cached ??= fetchBillingStatus().then((s) => s.plan).catch(() => null);
  return cached;
};

/**
 * Plan from the server. While loading, or if the server can't be reached (e.g. UI-only
 * `npm run dev`), nothing is locked so the app keeps working. Real limits are enforced
 * on the server, so this only controls what the sidebar shows.
 */
export function usePlan(): PlanId {
  const [plan, setPlan] = useState<PlanId>('pro');
  useEffect(() => {
    let alive = true;
    loadPlan().then((p) => { if (alive && p) setPlan(p); });
    return () => { alive = false; };
  }, []);
  return plan;
}
