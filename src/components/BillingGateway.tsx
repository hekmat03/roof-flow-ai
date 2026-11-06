import React from 'react';
import { WifiOff } from 'lucide-react';
import { useBilling } from '../context/BillingContext';
import { PricingPlans } from './PricingPlans';
import { BillingAccount } from './BillingAccount';
import { CardSkeleton } from './Skeleton';

/**
 * BillingGateway — one loader for both billing tabs. Both render from the same
 * server payload, so plan, quota and payment state can never disagree. While
 * loading we show a skeleton; if the request fails we say so plainly instead of
 * showing placeholder prices.
 */
export const BillingGateway: React.FC<{ view: string }> = ({ view }) => {
  const { status, loading, error, reload } = useBilling();

  if (loading && !status) {
    return <CardSkeleton lines={3} label="Loading plan and usage details…" />;
  }

  if (!status) {
    return (
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex items-start gap-3">
          <WifiOff className="h-6 w-6 shrink-0 text-gold" aria-hidden />
          <div>
            <h2 className="font-semibold text-ink">Billing details are unavailable</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {error ?? 'Could not load billing details.'}
            </p>
            <p className="mt-2 text-xs text-ink-mute">
              No plan, price or quota is shown when it cannot be read from the server.
            </p>
            <button
              type="button"
              onClick={reload}
              className="mt-4 rounded-xl bg-inset hover:bg-line-strong px-4 py-2.5 text-sm font-semibold text-ink transition min-h-[44px]"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return view === 'billing' ? (
    <BillingAccount status={status} onChanged={reload} />
  ) : (
    <PricingPlans status={status} onChanged={reload} />
  );
};

export default BillingGateway;
