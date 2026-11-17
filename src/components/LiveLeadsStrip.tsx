import React, { useEffect, useState } from 'react';
import { Globe, ArrowRight, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchRealLeads, formatCapturedAt, type RealLeadsResult } from '../lib/realLeads';

/**
 * LiveLeadsStrip: real leads captured by the website widget.
 *
 * These come from the server (/api/leads), not from the in-browser simulator, so they
 * are shown in their own labelled card and never mixed into the pipeline charts above.
 * Loading, not-configured, signed-out, error and empty are separate states on purpose:
 * "we could not reach storage" must never look like "no leads exist".
 */
export const LiveLeadsStrip: React.FC = () => {
  const { setActiveTab } = useApp();
  const [result, setResult] = useState<RealLeadsResult>({ state: 'loading', leads: [] });

  useEffect(() => {
    let alive = true;
    void fetchRealLeads().then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { state, leads, message } = result;
  const scored = leads.map((l) => l.lead_score ?? 0);
  const avg = scored.length > 0 ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 0;
  const newest = leads[0];
  const ready = state === 'ok';

  return (
    <section className="card card-pad" aria-label="Live website leads">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent-500/30 bg-accent-500/12 text-accent-400" aria-hidden="true">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <h2 className="card-title">Live website leads</h2>
            <p className="card-sub max-w-xl">Real visitors captured by your embedded widget. Shown separately from the agent pipeline above.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('crm')}
          className="inline-flex min-h-0 items-center gap-1.5 py-1 text-xs font-bold text-accent-400 transition-all hover:gap-2.5 hover:text-accent-300"
        >
          Open CRM board <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Live leads" value={ready ? String(leads.length) : '—'} loading={state === 'loading'} />
        <Stat label="Avg lead score" value={ready && leads.length > 0 ? `${String(avg)}/100` : '—'} loading={state === 'loading'} />
        <Stat label="Newest capture" value={ready && newest ? formatCapturedAt(newest.created_at) : '—'} loading={state === 'loading'} />
      </div>

      {state === 'not-configured' && (
        <Note tone="warn">{message ?? 'Connect the database to switch live capture on.'}</Note>
      )}
      {state === 'signed-out' && <Note tone="muted">{message ?? 'Sign in to see your website leads.'}</Note>}
      {state === 'error' && (
        <Note tone="error">
          {message ?? 'Could not reach the lead service.'} This is a connection problem, not an empty CRM.
        </Note>
      )}
      {ready && leads.length === 0 && (
        <div className="empty-state mt-4">
          <p className="text-sm font-bold text-ink">No website leads yet</p>
          <p className="max-w-md text-xs leading-relaxed text-ink-mute">
            Add the widget snippet from Configuration to your site. Open <span className="font-mono text-ink-soft">/widget-demo.html</span> and
            complete it as a visitor to see a test lead land here.
          </p>
        </div>
      )}
    </section>
  );
};

const Stat: React.FC<{ label: string; value: string; loading?: boolean }> = ({ label, value, loading }) => (
  <div className="rounded-xl border border-line bg-white/[0.03] px-4 py-3">
    <p className="eyebrow">{label}</p>
    {loading ? (
      <div className="shimmer mt-2 h-6 w-16 rounded-md" aria-label="Loading" />
    ) : (
      <p className="tabular mt-1 text-xl font-extrabold text-ink">{value}</p>
    )}
  </div>
);

const TONES = {
  warn: 'text-amber-200 border-amber-400/25 bg-amber-400/[0.07]',
  error: 'text-rose-200 border-rose-400/25 bg-rose-400/[0.07]',
  muted: 'text-ink-soft border-line bg-white/[0.03]',
} as const;

const Note: React.FC<{ tone: keyof typeof TONES; children: React.ReactNode }> = ({ tone, children }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${TONES[tone]}`}>
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
);
