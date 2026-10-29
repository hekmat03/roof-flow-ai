
import React from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useBilling } from '../context/BillingContext';
import { PricingPlans } from './PricingPlans';
import { BillingAccount } from './BillingAccount';

/**
 * BillingGateway — one loader for both billing tabs. Both render from the same
 * server payload, so plan, quota and payment state can never disagree. While
 * loading we show a spinner; if the request fails we say so plainly instead of
 * showing placeholder prices.
 */
export const BillingGateway: React.FC<{ view: string }> = ({ view }) => {
  const { status, loading, error, reload } = useBilling();

  if (loading && !status) {
    return (
      <div className="glass rounded-2xl p-8 flex items-center gap-3 text-slate-300">
        <Loader2 className="h-5 w-5 animate-spin text-accent-400" aria-hidden />
        <span>Loading plan and usage details…</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex items-start gap-3">
          <WifiOff className="h-6 w-6 shrink-0 text-amber-400" aria-hidden />
          <div>
            <h2 className="font-semibold text-white">Billing details are unavailable</h2>
            <p className="mt-1 text-sm text-slate-300">
              {error ?? 'Could not load billing details.'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              No plan, price or quota is shown when it cannot be read from the server.
            </p>
            <button
              type="button"
              onClick={reload}
              className="mt-4 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition min-h-[44px]"
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
