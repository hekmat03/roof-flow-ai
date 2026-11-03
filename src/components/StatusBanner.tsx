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
      <div role="status" className={`${box} border-line bg-card/70 text-ink`}>
        <Loader2 className="h-4 w-4 animate-spin text-ink" aria-hidden />
        Loading your account and leads…
      </div>
    );
  }

  if (storageStatus === 'unconfigured') {
    return (
      <div role="alert" className={`${box} border-gold/40 bg-gold/10 text-gold`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        The database is not connected, so nothing can be saved yet.
      </div>
    );
  }

  if (storageStatus === 'error' || storageError) {
    return (
      <div role="alert" className={`${box} border-danger/40 bg-danger/10 text-danger`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">
          We could not reach the database, so your latest changes may not be saved. Check your connection and reload.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-1.5 font-semibold text-gold-ink hover:bg-gold"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reload
        </button>
      </div>
    );
  }

  if (billingError) {
    return (
      <div role="alert" className={`${box} border-gold/40 bg-gold/10 text-gold`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">Plan and usage details are unavailable right now.</span>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-2 rounded-lg border border-gold/50 px-3 py-1.5 font-semibold hover:bg-gold/20"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Retry
        </button>
      </div>
    );
  }

  return null;
}
