import React, { useState } from 'react';
import { Check, Minus, ShieldAlert, Sparkles, AlertTriangle } from 'lucide-react';
import {
  type BillingStatus,
  type PlanView,
  type UsageView,
} from '../lib/billingApi';
import { lemonCheckoutUrl } from '../lib/lemonCheckout';
import { useApp } from '../context/AppContext';

/**
 * PricingPlans — the three plans, rendered from the SERVER catalogue.
 *
 * HONESTY RULES ENFORCED HERE:
 *  - prices, quotas and feature lists come from /api/billing/status; nothing is
 *    hard-coded in this component, so the UI cannot advertise something the
 *    server does not enforce;
 *  - the upgrade button is disabled and says "Payments not activated yet" while
 *    `paymentsActivated` is false. It never opens a fake checkout;
 *  - the "not included in any plan" list is rendered verbatim, so a visitor is
 *    told which features are simulations instead of guessing.
 */

const CheckRow: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <li className="flex items-start gap-2 text-sm leading-snug">
    {ok ? (
      <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" aria-hidden />
    ) : (
      <Minus className="h-4 w-4 mt-0.5 shrink-0 text-slate-600" aria-hidden />
    )}
    <span className={ok ? 'text-slate-200' : 'text-slate-500'}>{children}</span>
  </li>
);

export const UsageMeter: React.FC<{ usage: UsageView; planName: string }> = ({ usage, planName }) => {
  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const storageReady = usage.storage === 'ok';
  const tone = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-accent-500';
  return (
    <div className="glass rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-100">Conversations this month</h3>
        <span className="text-sm text-slate-400">{planName} plan</span>
      </div>
      <p className="mt-3 text-3xl font-bold text-white tabular-nums">
        {usage.used}
        <span className="text-slate-500 text-xl"> / {usage.limit}</span>
      </p>
      <div className="mt-3 h-2.5 w-full rounded-full bg-slate-800 overflow-hidden" role="progressbar"
           aria-valuenow={usage.used} aria-valuemin={0} aria-valuemax={usage.limit}>
        <div className={`h-full ${tone} transition-all`} style={{ width: `${String(pct)}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Resets on {usage.periodEnd}. One conversation = one chat thread that received at least one AI reply.
      </p>
      {!storageReady && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Usage storage is not connected yet ({usage.storage}), so this counter cannot be trusted until the
            database migration is applied. Conversations are not being counted.
          </span>
        </p>
      )}
    </div>
  );
};

const PlanCard: React.FC<{
  plan: PlanView;
  current: boolean;
  paymentsActivated: boolean;
  authenticated: boolean;
  onUpgrade: (plan: 'starter' | 'pro') => void;
  busy: boolean;
}> = ({ plan, current, paymentsActivated, authenticated, onUpgrade, busy }) => {
  const paid = plan.priceMonthlyUsd > 0;
  const buttonLabel = current
    ? 'Your current plan'
    : !paid
      ? 'Included by default'
      : paymentsActivated
        ? `Upgrade to ${plan.name}`
        : 'Payments not activated yet';
  const disabled = current || !paid || !paymentsActivated || busy;
  return (
    <div
      className={`glass rounded-2xl p-5 md:p-6 flex flex-col ${
        current ? 'ring-2 ring-accent-500/70' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
        {current && (
          <span className="rounded-full bg-accent-500/15 px-2.5 py-0.5 text-xs font-semibold text-accent-300">
            Current plan
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
      <p className="mt-4">
        <span className="text-3xl font-bold text-white">${plan.priceMonthlyUsd}</span>
        <span className="text-slate-400 text-sm"> / month</span>
      </p>
      <p className="mt-1 text-sm text-accent-300 font-medium">
        {plan.conversationsPerMonth} AI conversations / month
      </p>
      <ul className="mt-5 space-y-2.5 flex-1">
        {plan.includes.map((f) => (
          <CheckRow key={f} ok>
            {f}
          </CheckRow>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled}
        title={
          !paid
            ? 'Included for every account — nothing to buy.'
            : !paymentsActivated
              ? 'Lemon Squeezy checkout URLs are not configured yet, so no checkout can be created.'
              : !authenticated
                ? 'Create an account first, then choose this plan.'
                : undefined
        }
        onClick={() => {
          if (paid && !current) onUpgrade(plan.id as 'starter' | 'pro');
        }}
        className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[44px] inline-flex items-center justify-center ${
          disabled
            ? 'bg-slate-800/70 text-slate-500 cursor-not-allowed'
            : 'bg-accent-600 hover:bg-accent-500 text-white active:scale-[0.99]'
        }`}
      >
        {busy ? 'Opening checkout…' : buttonLabel}
      </button>
      {paid && !paymentsActivated && (
        <p className="mt-2 text-[11px] text-slate-500">
          Activates automatically once payment keys are added.
        </p>
      )}
    </div>
  );
};

export const PricingPlans: React.FC<{ status: BillingStatus; onChanged: () => void }> = ({
  status,
  onChanged,
}) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { user, tenant } = useApp();

  const handleUpgrade = async (plan: 'starter' | 'pro') => {
    setBusy(true);
    setNotice(null);
    try {
      const url = lemonCheckoutUrl(plan, {
        email: user?.email ?? undefined,
        userId: user?.id,
        tenantId: tenant?.id,
      });
      if (url) {
        window.location.href = url;
        return;
      }
      setNotice('Lemon Squeezy checkout is not configured for that plan yet.');
    } catch {
      setNotice('Could not open checkout.');
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="h-6 w-6 text-accent-400" aria-hidden />
          <h1 className="text-2xl md:text-3xl font-bold text-white">Plans &amp; pricing</h1>
        </div>
        <p className="mt-2 text-slate-300 max-w-3xl">
          Every account starts on Free. Limits below are enforced on the server, not in the browser — editing
          anything in dev tools cannot raise a quota.
        </p>
        {!status.paymentsActivated && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Payments are not activated.</strong> Lemon Squeezy checkout
              URLs are not set, so no plan can be purchased yet. Add VITE_LEMON_CHECKOUT_STARTER and
              VITE_LEMON_CHECKOUT_PRO to activate checkout.
            </span>
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">
            {notice}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {status.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={status.authenticated && status.plan === plan.id}
            paymentsActivated={status.paymentsActivated}
            authenticated={status.authenticated}
            onUpgrade={(p) => void handleUpgrade(p)}
            busy={busy}
          />
        ))}
      </div>

      <section className="glass rounded-2xl p-5 md:p-6">
        <h2 className="font-semibold text-slate-100">What no plan includes yet</h2>
        <p className="mt-1 text-sm text-slate-400">
          These are simulations in the product today. They are listed here so nothing is oversold.
        </p>
        <ul className="mt-4 space-y-2.5">
          {status.notIncluded.map((item) => (
            <CheckRow key={item} ok={false}>
              {item}
            </CheckRow>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default PricingPlans;
