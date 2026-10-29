import React, { useState } from 'react';
import { AlertTriangle, CreditCard, LogOut, CheckCircle2 } from 'lucide-react';
import { formatPeriod, openPortal, type BillingStatus } from '../lib/billingApi';
import { useAuth } from '../context/AuthContext';
import { useBilling } from '../context/BillingContext';
import { navigate } from '../lib/router';
import { UsageMeter } from './PricingPlans';

/** Rendered only when a subscription genuinely reports `past_due`. */
export const PaymentFailureNotice: React.FC<{ planName: string }> = ({ planName }) => (
  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
    <div className="flex items-start gap-2">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">There is a problem with the last payment.</p>
        <p className="mt-1 text-rose-200/90">
          The {planName} plan stays active while the payment is retried. Update your payment method in
          the billing portal to avoid losing access.
        </p>
      </div>
    </div>
  </div>
);

const RETURN_TEXT: Record<string, string> = {
  success: 'Checkout completed. Your plan updates as soon as the payment is confirmed (usually a few seconds).',
  cancelled: 'Checkout was cancelled. Nothing was charged.',
  portal: 'Returned from the billing portal.',
};

export const BillingAccount: React.FC<{ status: BillingStatus; onChanged: () => void }> = ({
  status,
  onChanged,
}) => {
  const { signOut } = useAuth();
  const { returnFlag } = useBilling();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const planName = status.plans.find((p) => p.id === status.plan)?.name ?? 'Free';
  const sub = status.subscription;
  const pastDue = sub?.status === 'past_due';

  const handlePortal = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await openPortal();
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', true);
  };

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl p-5 md:p-7">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Billing &amp; account</h1>
        <p className="mt-2 text-slate-300 max-w-3xl">
          Your plan, your monthly chat allowance, and the controls for a paid subscription.
        </p>
        {returnFlag && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-100">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-400" aria-hidden />
            <span>{RETURN_TEXT[returnFlag]}</span>
          </p>
        )}
      </header>

      {pastDue && <PaymentFailureNotice planName={planName} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="glass rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-100">Account</h2>
              <p className="mt-1 text-sm text-slate-300 break-all">{status.user?.email}</p>
            </div>
            <span className="rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold text-accent-300 whitespace-nowrap">
              {planName}
            </span>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Subscription status</dt>
              <dd className="text-slate-100 font-medium">{sub?.status ?? 'none'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">{sub?.cancelAtPeriodEnd ? 'Access ends on' : 'Renews on'}</dt>
              <dd className="text-slate-100 font-medium">
                {formatPeriod(sub?.currentPeriodEnd, status.paymentsActivated)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Cancels at period end</dt>
              <dd className="text-slate-100 font-medium">{sub?.cancelAtPeriodEnd ? 'Yes' : 'No'}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={!status.paymentsActivated || !sub?.hasCustomer || busy}
              title={
                !status.paymentsActivated
                  ? 'Lemon Squeezy is not configured on the server yet.'
                  : !sub?.hasCustomer
                    ? 'No subscription yet. Upgrade first.'
                    : undefined
              }
              onClick={() => void handlePortal()}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[44px] bg-slate-800/70 text-slate-400 disabled:cursor-not-allowed enabled:bg-[#F97316] enabled:text-slate-950 enabled:hover:bg-orange-400"
            >
              <CreditCard className="h-4 w-4" aria-hidden />
              {busy ? 'Opening…' : 'Manage billing'}
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800/60 transition min-h-[44px]"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
          {notice && (
            <p className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">
              {notice}
            </p>
          )}
        </section>

        <div className="space-y-5">
          {status.usage ? (
            <UsageMeter usage={status.usage} planName={planName} />
          ) : (
            <div className="glass rounded-2xl p-5 md:p-6 text-sm text-slate-300">
              Usage is unavailable right now.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingAccount;
