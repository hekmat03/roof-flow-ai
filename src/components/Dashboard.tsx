import React from 'react';
import { useApp } from '../context/AppContext';
import { useBilling } from '../context/BillingContext';
/** Maps a CRM status to the shared status badge class. */
export function statusPillClass(status: string): string {
  switch (status) {
    case 'New Lead': return 'st-new';
    case 'Contacted': return 'st-contacted';
    case 'In Contact': return 'st-incontact';
    case 'Inspection Scheduled': return 'st-scheduled';
    case 'Inspection Completed': return 'st-inspected';
    case 'Estimate Sent': return 'st-estimate';
    case 'Closed-Won': return 'st-won';
    case 'Closed-Lost': return 'st-lost';
    case 'Follow-up Nurture': return 'st-nurture';
    default: return 'st-closed';
  }
}

export const Dashboard: React.FC = () => {
  const { leads, setActiveTab } = useApp();
  const { status: billingStatus } = useBilling();
  const stats = [
    { label: 'Captured leads', value: leads.length },
    { label: 'Inspections scheduled', value: leads.filter(lead => lead.status === 'Inspection Scheduled').length },
    { label: 'Estimates sent', value: leads.filter(lead => lead.status === 'Estimate Sent').length },
  ];
  const usage = billingStatus?.usage?.storage === 'ok' ? billingStatus.usage : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">Dashboard</h1>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Lead summary">
        {stats.map(stat => (
          <article key={stat.label} className="glass rounded-xl p-4">
            <p className="text-xs font-medium text-ink-mute">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold font-mono text-ink">{stat.value}</p>
          </article>
        ))}
      </section>

      {usage && (
        <section className="glass rounded-xl p-4" aria-label="Monthly chat usage">
          <div className="flex items-center justify-between text-xs">
            <h2 className="font-semibold text-ink">Chats used this month</h2>
            <span className="font-mono text-ink-soft">{usage.used} / {usage.limit}</span>
          </div>
          <progress className="mt-2 h-2 w-full accent-orange-500" value={Math.min(usage.used, usage.limit)} max={usage.limit || 1} aria-label={`${usage.used} of ${usage.limit} chats used`} />
        </section>
      )}

      {leads.length === 0 ? (
        <p className="glass rounded-xl p-4 text-sm text-ink-soft">No leads yet. Open Agent 1 and try a conversation.</p>
      ) : (
        <section className="glass rounded-xl p-4" aria-label="Recent leads">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent leads</h2>
            <button type="button" onClick={() => setActiveTab('crm')} className="text-xs font-semibold text-accent-400 hover:text-accent-300">Open CRM</button>
          </div>
          <ul className="divide-y divide-line/70">
            {leads.slice(0, 5).map(lead => (
              <li key={lead.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0 truncate text-ink">{lead.name}</span>
                <span className={`status-pill shrink-0 ${statusPillClass(lead.status)}`}>{lead.status}</span>
                <time className="shrink-0 text-ink-mute">{lead.chatLog[0]?.timestamp || '—'}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
