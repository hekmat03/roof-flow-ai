import React, { useEffect, useState } from 'react';
import { Globe, ArrowRight, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchRealLeads, formatCapturedAt, type RealLeadsResult } from '../lib/realLeads';

/**
 * LiveLeadsStrip — surfaces REAL widget leads on the Dashboard.
 *
 * WHY A SEPARATE STRIP INSTEAD OF FOLDING THEM INTO THE CHART MATH:
 * the Revenue Attribution and Conversion Funnel charts derive a time window and
 * per-status value shares from the simulator leads in AppContext. Real widget
 * leads arrive with a different shape (server timestamps, status always
 * "New Lead", score instead of a pipeline stage), so blending them would change
 * the charts' semantics silently. We therefore keep the existing charts and KPI
 * count-up exactly as they are — clearly labelled as simulator data — and show
 * live leads here as their own labelled figures. Nothing is double-counted, and
 * real leads are never invisible.
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

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent-400" /> Live Website Leads
          </h3>
          <p className="text-xs text-ink-mute mt-0.5">
            Real visitors captured by the embeddable widget — kept separate from the simulator figures
            (this release counts them here rather than mixing them into the charts).
          </p>
        </div>
        <button
          onClick={() => setActiveTab('crm')}
          className="text-xs text-accent-400 hover:text-accent-300 font-bold flex items-center gap-1.5 transition-colors hover:gap-2.5"
        >
          Open CRM Board <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
        <Stat label="Live leads" value={state === 'ok' ? String(leads.length) : '—'} />
        <Stat label="Avg lead score" value={state === 'ok' && leads.length > 0 ? `${String(avg)}/100` : '—'} />
        <Stat
          label="Newest capture"
          value={state === 'ok' && newest ? formatCapturedAt(newest.created_at) : '—'}
        />
      </div>

      {state === 'not-configured' && (
        <p className="text-xs text-accent-300/80 mt-4 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-accent-400 shrink-0 mt-0.5" />
          {message ?? 'Connect the database to switch live capture on.'}
        </p>
      )}
      {state === 'error' && (
        <p className="text-xs text-ink-soft mt-4 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
          {message ?? 'Could not reach the lead service.'} This is a connection problem, not an empty CRM.
        </p>
      )}
      {state === 'ok' && leads.length === 0 && (
        <p className="text-xs text-ink-mute mt-4">
          No live leads yet. Open <span className=" text-ink-mute">/widget-demo.html</span> and complete the
          widget as a visitor to see one land here.
        </p>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-line bg-inset p-3">
    <span className="block text-[10px] uppercase tracking-widest text-ink-mute font-bold">{label}</span>
    <span className="text-lg font-black text-ink">{value}</span>
  </div>
);
