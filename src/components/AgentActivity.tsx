/**
 * AgentActivity — transparent log of every real action the AI agent took
 * (booking requests, messages, CRM updates, scheduled follow-ups), with an
 * honest badge: SAVED / DEMO / FAILED.
 */
import React from 'react';
import { Zap, CalendarCheck, Mail, ClipboardList, Clock, AlertCircle } from 'lucide-react';
import type { AgentAction } from '../lib/applyActions';

const META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  book_inspection: { label: 'Inspection requested', Icon: CalendarCheck },
  send_message: { label: 'Message', Icon: Mail },
  update_crm: { label: 'CRM updated', Icon: ClipboardList },
  schedule_followup: { label: 'Follow-up scheduled', Icon: Clock },
};

export const AgentActivity: React.FC<{ actions: AgentAction[] }> = ({ actions }) => (
  <div className="glass-card p-5">
    <h3 className="text-sm font-bold text-ink flex items-center gap-2">
      <Zap className="h-4 w-4 text-accent-500" /> Agent Actions
    </h3>
    {actions.length === 0 ? (
      <p className="text-xs text-ink-mute mt-3">
        No actions yet. When you agree to book an inspection, the agent acts and every step is logged here.
      </p>
    ) : (
      <ul className="mt-3 space-y-2">
        {actions.map((a, i) => {
          const m = META[a.tool] || { label: a.tool, Icon: Zap };
          const badge = !a.result.ok ? 'FAILED' : a.result.simulated ? 'DEMO' : a.result.persisted ? 'SAVED' : 'DONE';
          const tone = !a.result.ok
            ? 'text-danger bg-danger/10 border-danger/30'
            : badge === 'DEMO'
              ? 'text-accent-400 bg-accent-500/10 border-accent-500/20'
              : 'text-accent-400 bg-accent-500/10 border-accent-500/20';
          return (
            <li key={i} className="flex items-start gap-3 bg-inset border border-line rounded-xl px-3 py-2">
              {a.result.ok ? <m.Icon className="h-4 w-4 text-ink-soft mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 text-danger mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-soft font-semibold">{m.label}</p>
                <p className="text-[11px] text-ink-mute truncate">
                  {a.result.ok ? a.result.status.replace(/_/g, ' ') : a.result.error}
                </p>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${tone}`}>{badge}</span>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
