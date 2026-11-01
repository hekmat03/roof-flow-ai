
import React from 'react';
import { Check, Crown, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { usePlan } from '../lib/usePlan';
import { useBilling } from '../context/BillingContext';
import { PLAN_NAMES, PLAN_PRICES, type PlanKey } from '../lib/planAccess';

const features: Record<PlanKey, string[]> = {
  starter: [
    'Website lead chatbot',
    'Basic CRM lead board',
    'Lead capture dashboard',
    'Standard support',
  ],
  pro: [
    'Everything in Starter',
    'Inbound AI phone agent',
    'Automated SMS and email',
    'Estimate follow-up agent',
    'Advanced analytics',
    'Priority support',
  ],
  business: [
    'Everything in Pro',
    'Multiple team members',
    'Advanced lead workflows',
    'Premium support',
  ],
};

const planIcons: Record<PlanKey, React.ElementType> = {
  starter: Zap,
  pro: Crown,
  business: ShieldCheck,
};

export const PricingPlans: React.FC = () => {
  const plan = usePlan();
  const { openUpgrade } = useBilling();

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-300">
          <Zap className="h-3.5 w-3.5" />
          Simple, transparent pricing
        </span>
        <h2 className="text-fluid-hero font-black text-white mt-4">
          Choose the right plan for your roofing business
        </h2>
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          Start with lead capture and upgrade when you’re ready to automate more of your sales process.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {(Object.keys(features) as PlanKey[]).map((key) => {
          const Icon = planIcons[key];
          const isCurrent = plan === key;
          const isPopular = key === 'pro';

          return (
            <div
              key={key}
              className={`glass rounded-2xl p-6 md:p-7 flex flex-col relative ${
                isPopular ? 'border border-accent-500/50 shadow-xl shadow-accent-500/10' : ''
              }`}
            >
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950">
                  Most popular
                </span>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-accent-500/10 text-accent-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-black text-white">{PLAN_NAMES[key]}</h3>
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
                    Current plan
                  </span>
                )}
              </div>

              <div className="mt-6">
                <span className="text-4xl font-black text-white">
                  ${PLAN_PRICES[key]}
                </span>
                <span className="text-sm text-slate-400"> / month</span>
              </div>

              <p className="text-xs text-slate-400 mt-2">
                {key === 'starter'
                  ? 'The essentials to capture and organize leads.'
                  : key === 'pro'
                    ? 'Automate follow-ups and handle more inbound opportunities.'
                    : 'For teams ready to scale their roofing sales operations.'}
              </p>

              <div className="mt-6 space-y-3 flex-1">
                {features[key].map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  if (!isCurrent) {
                    openUpgrade(`Upgrade to ${PLAN_NAMES[key]} to unlock the included features.`);
                  }
                }}
                disabled={isCurrent}
                className={`mt-7 w-full rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition ${
                  isCurrent
                    ? 'bg-slate-800 text-slate-500 cursor-default'
                    : 'btn-accent'
                }`}
              >
                {isCurrent ? 'Your current plan' : `Choose ${PLAN_NAMES[key]}`}
                {!isCurrent && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
