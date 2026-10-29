import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useBilling } from '../context/BillingContext';
import { startCheckout, type PlanView } from '../lib/billingApi';

const RANK = { free: 0, starter: 1, pro: 2 } as const;

export function UpgradeModal() {
  const { upgradeOpen, upgradeReason, closeUpgrade, status, plan } = useBilling();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!upgradeOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeUpgrade(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [upgradeOpen, closeUpgrade]);

  if (!upgradeOpen) return null;

  const options: PlanView[] = (status?.plans ?? []).filter((p) => RANK[p.id] > RANK[plan]);
  const usage = status?.usage;

  async function choose(id: 'starter' | 'pro') {
    setBusy(id);
    setNotice(null);
    try {
      const res = await startCheckout(id);
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setNotice(res.message ?? 'That was not possible right now.');
    } catch {
      setNotice('Could not reach the billing service. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={closeUpgrade}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#0F172A] p-5 sm:p-7 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={closeUpgrade} aria-label="Close" className="absolute right-4 top-4 text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-[#F97316]" aria-hidden />
          <h2 id="upgrade-title" className="text-xl sm:text-2xl font-bold">Upgrade to keep going</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          {upgradeReason ?? 'Your current plan does not include this.'}
        </p>
        {usage && (
          <p className="mt-1 text-xs text-slate-400">
            Used {usage.used} of {usage.limit} chats this month. Resets on {usage.periodEnd}.
          </p>
        )}

        {options.length === 0 ? (
          <p className="mt-6 text-sm text-slate-300">
            You are on the highest plan. Your chats reset on the first day of next month.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {options.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4 flex flex-col">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1">
                  <span className="text-3xl font-bold">${p.priceMonthlyUsd}</span>
                  <span className="text-sm text-slate-400"> / month</span>
                </p>
                <p className="mt-1 text-sm text-[#F97316] font-medium">{p.conversationsPerMonth.toLocaleString()} chats / month</p>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {p.includes.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-200">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => void choose(p.id as 'starter' | 'pro')}
                  disabled={busy !== null || !status?.paymentsActivated}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] py-3 font-bold text-slate-950 transition hover:bg-orange-400 disabled:opacity-60"
                >
                  {busy === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  {status?.paymentsActivated ? `Upgrade to ${p.name}` : 'Payments not set up yet'}
                </button>
              </div>
            ))}
          </div>
        )}

        {notice && <p role="alert" className="mt-4 text-sm text-red-400">{notice}</p>}
      </div>
    </div>
  );
}
