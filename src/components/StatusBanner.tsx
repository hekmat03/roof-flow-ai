import { AlertTriangle, Bot, Loader2, RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useBilling } from '../context/BillingContext';
import { AI_NOTICES, DB_NOTICES, reportAiOk, useServiceStatus } from '../lib/serviceStatus';

/**
 * Says what is happening with data, AI and billing, in plain words:
 * a loading line while your leads load, and a clear message (with a Try again
 * button) when the database, the AI or billing cannot be reached.
 */
export function StatusBanner() {
  const { storageStatus, storageError, refreshTenant } = useApp();
  const { error: billingError, reload } = useBilling();
  const { ai, db } = useServiceStatus();

  const box = 'mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm';
  const warn = `${box} border-gold/40 bg-gold/10 text-gold`;
  const bad = `${box} border-danger/40 bg-danger/10 text-danger`;
  const retryBtn = 'inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-1.5 font-semibold text-gold-ink hover:bg-gold';

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
      <div role="alert" className={warn}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        The database is not connected, so nothing can be saved yet.
      </div>
    );
  }

  const banners: React.ReactNode[] = [];

  if (storageStatus === 'error' || storageError) {
    const notice = DB_NOTICES[db ?? 'unavailable'];
    banners.push(
      <div key="db" role="alert" className={bad}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">
          <strong>{notice.title}.</strong> {notice.detail}
        </span>
        <button type="button" onClick={() => void refreshTenant()} className={retryBtn}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </button>
      </div>,
    );
  }

  if (ai) {
    const notice = AI_NOTICES[ai];
    banners.push(
      <div key="ai" role="status" className={warn}>
        <Bot className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">
          <strong>{notice.title}.</strong> {notice.detail}
        </span>
        <button
          type="button"
          onClick={reportAiOk}
          aria-label="Dismiss AI notice"
          className="inline-flex items-center gap-1 rounded-lg border border-gold/50 px-3 py-1.5 font-semibold hover:bg-gold/20"
        >
          <X className="h-4 w-4" aria-hidden /> Dismiss
        </button>
      </div>,
    );
  }

  if (billingError) {
    banners.push(
      <div key="billing" role="alert" className={warn}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-[12rem]">Plan and usage details are unavailable right now.</span>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-2 rounded-lg border border-gold/50 px-3 py-1.5 font-semibold hover:bg-gold/20"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Retry
        </button>
      </div>,
    );
  }

  return banners.length ? <>{banners}</> : null;
}
