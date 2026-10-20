import React from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useBillingStatus } from '../lib/billingApi';
import { PricingPlans } from './PricingPlans';
import { BillingAccount } from './BillingAccount';

/**
 * BillingGateway — one loader for both billing tabs.
 *
 * Both tabs render from the same `/api/billing/status` payload, so the plan,
 * quota and payment-activation state can never disagree between them. While the
 * request is in flight we show a spinner, and if it fails we say so plainly
 * rather than rendering placeholder prices.
 */
export const BillingGateway: React.FC<{ view: string }> = ({ view }) => {
  const { result, reload } = useBillingStatus();

  if (result.state === 'loading') {
    return (
      <div className="glass rounded-2xl p-8 flex items-center gap-3 text-slate-300">
        <Loader2 className="h-5 w-5 animate-spin text-accent-400" aria-hidden />
        <span>Loading plan and usage details…</span>
      </div>
    );
  }

  if (result.state === 'error') {
    return (
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex items-start gap-3">
          <WifiOff className="h-6 w-6 shrink-0 text-amber-400" aria-hidden />
          <div>
            <h2 className="font-semibold text-white">Billing details are unavailable</h2>
            <p className="mt-1 text-sm text-slate-300">{result.message}</p>
            <p className="mt-2 text-xs text-slate-500">
              No plan, price or quota is shown here when it cannot be read from the server — the app never guesses.
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
    <BillingAccount status={result.data} onChanged={reload} />
  ) : (
    <PricingPlans status={result.data} onChanged={reload} />
  );
};

export default BillingGateway;
