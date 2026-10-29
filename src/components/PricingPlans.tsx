
import React, { useState } from 'react';
import { Check, Minus, ShieldAlert, Sparkles, AlertTriangle } from 'lucide-react';
import {
  startCheckout,
  type BillingStatus,
  type PlanView,
  type UsageView,
} from '../lib/billingApi';

/**
 * PricingPlans — the three plans, rendered from the SERVER catalogue
 * (/api/billing/status). Nothing is hard-coded here, so the UI cannot
 * advertise something the server does not enforce. Upgrade buttons stay
 * disabled while Lemon Squeezy is not configured on the server.
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
        <h3 className="font-semibold text-slate-100">Chats this month</h3>
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
        Resets on {usage.periodEnd}. One chat = one conversation thread that received at least one AI reply.
      </p>
      {!storageReady && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Usage could not be read ({usage.storage}). Make sure supabase/002_billing.sql was applied.
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
        : 'Payments not set up yet';
  const disabled = current || !paid || !paymentsActivated || busy || !authenticated;
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
        {plan.conversationsPerMonth.toLocaleString()} chats / month
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
            ? 'Included for every account.'
            : !paymentsActivated
              ? 'Lemon Squeezy is not configured on the server yet.'
              : undefined
        }
        onClick={() => {
          if (paid && !current) onUpgrade(plan.id as 'starter' | 'pro');
        }}
        className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[44px] ${
          disabled
            ? 'bg-slate-800/70 text-slate-500 cursor-not-allowed'
            : 'bg-[#F97316] hover:bg-orange-400 text-slate-950 active:scale-[0.99]'
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
};

export const PricingPlans: React.FC<{ status: BillingStatus; onChanged: () => void }> = ({
  status,
  onChanged,
}) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleUpgrade = async (plan: 'starter' | 'pro') => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await startCheckout(plan);
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setNotice(res.message ?? 'That was not possible right now.');
    } catch {
      setNotice('Could not reach the billing service.');
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
          Every account starts on Free. Limits are enforced on the server, so editing anything in the
          browser cannot raise a quota.
        </p>
        {!status.paymentsActivated && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Payments are not set up yet.</strong> The Lemon Squeezy
              keys have not been added to the server, so no plan can be purchased. The buttons turn on
              automatically once they are.
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
          These are simulations in the product today. They are listed so nothing is oversold.
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
