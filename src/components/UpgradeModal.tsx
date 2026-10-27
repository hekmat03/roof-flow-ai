import React from 'react';
import { Lock, Sparkles, X } from 'lucide-react';
import { upgradeLabel, type PlanId } from '../lib/planAccess';

export const UpgradeModal: React.FC<{
  open: boolean;
  plan: PlanId;
  featureLabel: string;
  onClose: () => void;
  onUpgrade: () => void;
}> = ({ open, plan, featureLabel, onClose, onUpgrade }) => {
  if (!open) return null;
  const label = upgradeLabel(plan) || 'Upgrade';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass rounded-2xl p-6 w-full max-w-md animate-pop-in">
        <button type="button" className="absolute top-3 right-3 text-slate-400 hover:text-white min-h-0" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-500/15 border border-accent-500/25">
            <Lock className="h-5 w-5 text-accent-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{featureLabel} is on a higher plan</h2>
            <p className="text-xs text-slate-400 mt-0.5">Your {plan} plan does not include this feature yet.</p>
          </div>
        </div>
        <p className="text-sm text-slate-300 mt-4">
          Upgrade to unlock this part of RoofFlow AI. Agent code stays in the product — we only turn visibility on when your plan includes it.
        </p>
        <button type="button" onClick={onUpgrade} className="btn-accent w-full mt-6 px-4 py-3 text-sm inline-flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4" />
          {label}
        </button>
      </div>
    </div>
  );
};
