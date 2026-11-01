import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useBilling } from '../context/BillingContext';

/**
 * Shows what is happening with data and billing, in plain words:
 * a loading line while your leads load, a friendly message (with a retry
 * button) when the database or billing service cannot be reached.
 */
export function StatusBanner() {
  const { storageStatus, storageError } = useApp();
  const { error: billingError, reload } = useBilling();

  const box = 'mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm';

  if (storageStatus === 'loading') {
    return (
      <div role="status" className={`${box} border-slate-700 bg-slate-900/70 text-slate-200`}>
        <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" aria-hidden />
        Loading your account and leads…
      </div>
    );
  }

  if (storageStatus === 'unconfigured') {
    return (
      <div role="alert" className={`${box} border-amber-500/40 bg-amber-500/10 text-amber-100`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        The database is not connected, so nothing can be saved yet.
      </div>
    );
  }

  if (storageStatus === 'error' || storageError) {
    return (
      <div role="alert" className={`${box} border-rose-500/40 bg-rose-500/10 text-rose-100`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">
          We could not reach the database, so your latest changes may not be saved. Check your connection and reload.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-3 py-1.5 font-semibold text-slate-950 hover:bg-orange-400"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reload
        </button>
      </div>
    );
  }

  if (billingError) {
    return (
      <div role="alert" className={`${box} border-amber-500/40 bg-amber-500/10 text-amber-100`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">Plan and usage details are unavailable right now.</span>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-400/50 px-3 py-1.5 font-semibold hover:bg-amber-500/20"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Retry
        </button>
      </div>
    );
  }

  return null;
}
