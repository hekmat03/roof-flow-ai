import React, { useCallback, useEffect, useState } from 'react';
import { Globe, RefreshCw, X, ShieldCheck, AlertTriangle, Inbox } from 'lucide-react';
import {
  fetchRealLeads,
  formatCapturedAt,
  scoreTier,
  type RealLead,
  type RealLeadsResult,
} from '../lib/realLeads';

/**
 * RealLeadsBoard — the LIVE half of the CRM.
 * ---------------------------------------------------------------------------
 * Shows leads that real website visitors submitted through the embeddable
 * widget (source "Website Widget"), read from our own /api/leads endpoint.
 *
 * HONEST LIMITS (this iteration):
 *  - Real leads are READ-ONLY here. Status changes are not written back to the
 *    database yet; the simulated leads below keep their full editing behaviour.
 *  - Every row carries a "LIVE · Website Widget" badge so a real visitor is
 *    never confused with demo data.
 */
export const RealLeadsBoard: React.FC = () => {
  const [result, setResult] = useState<RealLeadsResult>({ state: 'loading', leads: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<RealLead | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const next = await fetchRealLeads();
    setResult(next);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { state, leads, message } = result;

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent-400" />
            Live Widget Leads
            {state === 'ok' && (
              <span className="label-micro rounded-md px-2 py-0.5 border text-accent-300 bg-accent-500/10 border-accent-500/30">
                LIVE · Website Widget
              </span>
            )}
          </h3>
          <p className="text-xs text-ink-mute mt-0.5">
            Real visitors who completed the chat widget on a contractor&rsquo;s website.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={refreshing}
          className="text-xs text-accent-400 hover:text-accent-300 font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {state === 'loading' && <p className="text-sm text-ink-mute py-6 text-center">Checking for live leads…</p>}

      {state === 'not-configured' && (
        <div className="rounded-xl border border-accent-500/30 bg-accent-500/5 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-accent-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-accent-300">Live capture is not switched on yet</p>
            <p className="text-xs text-accent-300/70 mt-1 leading-relaxed">
              {message ??
                'The owner still needs to connect the database. Until then the widget tells visitors to try again later.'}
            </p>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-ink-soft">Couldn&rsquo;t load live leads</p>
            <p className="text-xs text-ink-mute mt-1 leading-relaxed">
              {message ?? 'The lead service did not respond.'} This is a connection problem, not an empty CRM.
            </p>
          </div>
        </div>
      )}

      {state === 'ok' && leads.length === 0 && (
        <div className="py-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-inset border border-line flex items-center justify-center mb-3">
            <Inbox className="h-5 w-5 text-ink-mute" />
          </div>
          <p className="text-sm font-semibold text-ink-soft">No live widget leads yet</p>
          <p className="text-xs text-ink-mute mt-1 max-w-sm mx-auto">
            Visitors who complete the widget on an embedded page land here. Try it on the demo page at{' '}
            <span className=" text-ink-mute">/widget-demo.html</span>.
          </p>
        </div>
      )}

      {state === 'ok' && leads.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                <th className="py-2 px-2 font-bold">Visitor</th>
                <th className="py-2 px-2 font-bold">Contact</th>
                <th className="py-2 px-2 font-bold hidden md:table-cell">Roofing need</th>
                <th className="py-2 px-2 font-bold">Score</th>
                <th className="py-2 px-2 font-bold hidden sm:table-cell">Captured</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((lead) => {
                const tier = scoreTier(lead.lead_score);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setOpen(lead)}
                    className="cursor-pointer row-stripe hover:bg-inset transition-colors"
                  >
                    <td className="py-3 px-2">
                      <div className="font-bold text-ink">{lead.name}</div>
                      <span className="label-micro rounded px-1.5 py-0.5 border text-accent-300 bg-accent-500/10 border-accent-500/30">
                        LIVE · Website Widget
                      </span>
                    </td>
                    <td className="py-3 px-2 text-ink-soft">
                      <div>{lead.phone ?? '—'}</div>
                      <div className="text-xs text-ink-mute">{lead.email ?? ''}</div>
                    </td>
                    <td className="py-3 px-2 text-ink-soft hidden md:table-cell max-w-[240px]">
                      <span className="line-clamp-2">{lead.roofing_need ?? '—'}</span>
                      {lead.zip_code && <span className="block text-xs text-ink-mute">ZIP {lead.zip_code}</span>}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`text-xs font-bold rounded-md px-2 py-1 border ${tier.className}`}>
                        {lead.lead_score ?? 0} · {tier.label}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs text-ink-mute hidden sm:table-cell">
                      {formatCapturedAt(lead.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-ink-mute mt-3">
            Read-only this release: live leads are stored server-side and status editing isn&rsquo;t wired back yet.
          </p>
        </div>
      )}

      {open && <RealLeadDetail lead={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

/** Slide-over with the full transcript and the consent record. */
const RealLeadDetail: React.FC<{ lead: RealLead; onClose: () => void }> = ({ lead, onClose }) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-inset backdrop-blur-sm" onClick={onClose}>
    <div
      className="w-full max-w-xl h-full overflow-y-auto glass-card border-l border-line p-6 animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-black text-ink">{lead.name}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="label-micro rounded px-2 py-0.5 border text-accent-300 bg-accent-500/10 border-accent-500/30">
              LIVE · Website Widget
            </span>
            <span className="text-xs text-ink-mute">Captured {formatCapturedAt(lead.created_at)}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-mute hover:text-ink" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
        <Field label="Phone" value={lead.phone ?? '—'} />
        <Field label="Email" value={lead.email ?? '—'} />
        <Field label="ZIP" value={lead.zip_code ?? '—'} />
        <Field label="Status" value={lead.status ?? 'New Lead'} />
        <Field label="Source" value={lead.source ?? 'Website Widget'} />
        <Field label="Lead score" value={`${String(lead.lead_score ?? 0)} / 100 · ${scoreTier(lead.lead_score).label}`} />
      </div>

      <div className="mb-5">
        <h4 className="text-xs font-bold uppercase tracking-widest text-ink-mute mb-2">Roofing need</h4>
        <p className="text-sm text-ink-soft leading-relaxed">{lead.roofing_need ?? '—'}</p>
      </div>

      <div className="mb-5">
        <h4 className="text-xs font-bold uppercase tracking-widest text-ink-mute mb-2 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-accent-400" /> Consent record
        </h4>
        <div className="rounded-xl border border-line bg-inset p-3">
          <p className="text-xs text-ink-soft leading-relaxed">{lead.consent_text ?? 'No consent text recorded.'}</p>
          <p className="text-[11px] text-ink-mute mt-2">
            {lead.consent ? 'Consent given with the wording above at capture time.' : 'Consent NOT recorded.'}
          </p>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-ink-mute mb-2">
          Conversation ({(lead.conversation ?? []).length} turns)
        </h4>
        <div className="space-y-2">
          {(lead.conversation ?? []).map((turn, i) => (
            <div
              key={`${lead.id}-${String(i)}`}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                turn.sender === 'visitor'
                  ? 'ml-auto bg-accent-500/15 border border-accent-500/30 text-accent-100'
                  : 'bg-inset border border-line text-ink-soft'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-widest opacity-60 mb-0.5">{turn.sender}</span>
              {turn.text}
            </div>
          ))}
          {(lead.conversation ?? []).length === 0 && (
            <p className="text-xs text-ink-mute italic">No transcript was sent with this lead.</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-ink-mute mt-6">
        This lead lives in the server database, so it is visible on every computer — unlike the simulated demo
        leads below, which live only in this browser.
      </p>
    </div>
  </div>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-line bg-inset p-3">
    <span className="block text-[10px] uppercase tracking-widest text-ink-mute font-bold mb-0.5">{label}</span>
    <span className="text-ink break-words">{value}</span>
  </div>
);
