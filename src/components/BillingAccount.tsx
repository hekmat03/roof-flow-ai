import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  LogIn,
  LogOut,
  UserPlus,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  formatPeriod,
  openPortal,
  signIn,
  signOut,
  signUp,
  type BillingStatus,
} from '../lib/billingApi';
import { UsageMeter } from './PricingPlans';

/**
 * BillingAccount — sign in, see the plan and usage, manage the subscription.
 *
 * HONESTY RULES ENFORCED HERE:
 *  - accounts are optional: this page says so, and nothing else in the app is
 *    gated behind a login;
 *  - with no Stripe account, "Manage billing" is disabled with a tooltip that
 *    explains exactly why, and the renewal date prints as an em dash;
 *  - the payment-failure notice is a real component, coded now, that only renders
 *    when a subscription actually reports `past_due`.
 */

/** Rendered when a subscription is genuinely past due. Never shown otherwise. */
export const PaymentFailureNotice: React.FC<{ planName: string }> = ({ planName }) => (
  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
    <div className="flex items-start gap-2">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">There is a problem with the last payment.</p>
        <p className="mt-1 text-rose-200/90">
          The {planName} plan is still marked past due. Update the payment method with Lemon Squeezy to keep access.
        </p>
      </div>
    </div>
  </div>
);

const AuthForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
      if (res.ok) {
        setNotice(res.message ?? (mode === 'signin' ? 'Signed in.' : 'Account created.'));
        onDone();
      } else {
        setNotice(res.message ?? 'That did not work.');
      }
    } catch {
      setNotice('Could not reach the account service.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2">
        {mode === 'signin' ? <LogIn className="h-5 w-5 text-accent-400" aria-hidden /> : <UserPlus className="h-5 w-5 text-accent-400" aria-hidden />}
        <h2 className="font-semibold text-slate-100">
          {mode === 'signin' ? 'Sign in' : 'Create an account'}
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        An account is optional. The dashboard, the four simulators and the CRM all keep working without one —
        the account is what gives a plan and a monthly conversation quota.
      </p>
      <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl bg-slate-900/80 border border-slate-700 px-3 py-2.5 text-slate-100 outline-none focus:border-accent-500 min-h-[44px]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl bg-slate-900/80 border border-slate-700 px-3 py-2.5 text-slate-100 outline-none focus:border-accent-500 min-h-[44px]"
          />
          <span className="text-[11px] text-slate-500">At least 8 characters.</span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-accent-600 hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold px-4 py-3 text-sm transition min-h-[44px]"
        >
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        type="button"
        className="mt-3 text-sm text-accent-300 hover:text-accent-200 underline underline-offset-2"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setNotice(null);
        }}
      >
        {mode === 'signin' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
      </button>
      {notice && (
        <p className="mt-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">{notice}</p>
      )}
    </div>
  );
};

export const BillingAccount: React.FC<{ status: BillingStatus; onChanged: () => void }> = ({
  status,
  onChanged,
}) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [returnBanner, setReturnBanner] = useState<string | null>(null);

  // Stripe returns the visitor to /app/?billing=… — report what happened instead
  // of silently dropping them on the page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('billing');
    if (!flag) return;
    setReturnBanner(
      flag === 'success'
        ? 'Checkout completed. The plan updates as soon as Lemon Squeezy confirms the subscription.'
        : flag === 'cancelled'
          ? 'Checkout was cancelled. Nothing was charged.'
          : 'Returned from the billing portal.'
    );
    params.delete('billing');
    params.delete('plan');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

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

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl p-5 md:p-7">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Billing &amp; account</h1>
        <p className="mt-2 text-slate-300 max-w-3xl">
          Your plan, your monthly conversation allowance, and the controls for a paid subscription.
        </p>
        {returnBanner && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-100">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-400" aria-hidden />
            <span>{returnBanner}</span>
          </p>
        )}
      </header>

      {pastDue && <PaymentFailureNotice planName={planName} />}

      {!status.authenticated ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AuthForm onDone={onChanged} />
          <div className="glass rounded-2xl p-5 md:p-6">
            <h2 className="font-semibold text-slate-100">Why an account at all?</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>• It gives the account its own conversation quota, counted on the server.</li>
              <li>• It is what a paid plan would attach to once payments are activated.</li>
              <li>• Nothing else needs it: every simulator, the CRM and the dashboard stay open.</li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Passwords are handled by Supabase Auth. This site never sees or stores them, and the browser is never
              given a database key.
            </p>
          </div>
        </div>
      ) : (
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
                <dd className="text-slate-100 font-medium">
                  {status.paymentsActivated ? (sub?.status ?? 'none') : '— until payments activated'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Renews on</dt>
                <dd className="text-slate-100 font-medium">
                  {formatPeriod(sub?.currentPeriodEnd, status.paymentsActivated)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Cancels at period end</dt>
                <dd className="text-slate-100 font-medium">
                  {status.paymentsActivated ? (sub?.cancelAtPeriodEnd ? 'Yes' : 'No') : '—'}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={!status.paymentsActivated || !sub?.hasCustomer || busy}
                title={
                  !status.paymentsActivated
                    ? 'Lemon Squeezy is not connected yet, so there is no customer portal to open.'
                    : !sub?.hasCustomer
                      ? 'There is no billing account for this user yet — start a subscription first.'
                      : undefined
                }
                onClick={() => void handlePortal()}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition min-h-[44px] bg-slate-800/70 text-slate-400 disabled:cursor-not-allowed enabled:bg-accent-600 enabled:text-white enabled:hover:bg-accent-500"
              >
                <CreditCard className="h-4 w-4" aria-hidden />
                Manage billing
              </button>
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => {
                    setNotice('Signed out.');
                    onChanged();
                  });
                }}
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
            {!status.paymentsActivated && (
              <p className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
                <Info className="h-5 w-5 mt-0.5 shrink-0 text-slate-400" aria-hidden />
                <span>
                  Billing is handled by Lemon Squeezy checkout and webhooks. While checkout URLs are missing,
                  this page will not invent a renewal date or an invoice.
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingAccount;
