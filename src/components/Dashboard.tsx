import React from 'react';
import { ArrowRight, CalendarCheck, FileText, MessageSquare, Sparkles, Trophy, Users } from 'lucide-react';
import { useApp, type Lead } from '../context/AppContext';
import { KpiCard } from './dashboard/KpiCard';
import { BarList, Donut, type ChartDatum } from './dashboard/charts';
import { LiveLeadsStrip } from './LiveLeadsStrip';

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

// Palette: the existing gold and cream, plus the four status colours already used by the pills.
const GOLD = '#d4af37';
const GOLD_SOFT = '#ecd38a';
const SKY = '#7dd3fc';
const VIOLET = '#a78bfa';
const GREEN = '#34d399';
const STONE = '#9a968b';

const STAGES: Array<{ status: Lead['status']; color: string }> = [
  { status: 'New Lead', color: GOLD },
  { status: 'Contacted', color: GOLD_SOFT },
  { status: 'In Contact', color: SKY },
  { status: 'Inspection Scheduled', color: GREEN },
  { status: 'Inspection Completed', color: '#6ee7b7' },
  { status: 'Estimate Sent', color: VIOLET },
  { status: 'Closed-Won', color: '#10b981' },
];

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const formatInspection = (lead: Lead): string => {
  const date = lead.appointmentDetails?.date;
  const time = lead.appointmentDetails?.time;
  if (date) {
    const parsed = new Date(`${date}T12:00:00`);
    const pretty = Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return time ? `${pretty} · ${time}` : pretty;
  }
  return lead.scheduledDate ?? 'Date to be confirmed';
};

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span
    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent-500/30 bg-accent-500/15 text-xs font-extrabold text-accent-300"
    aria-hidden="true"
  >
    {initials(name)}
  </span>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }> = ({
  icon,
  title,
  body,
  action,
}) => (
  <div className="empty-state">
    <span className="grid h-11 w-11 place-items-center rounded-xl border border-line-strong bg-white/[0.05] text-accent-400" aria-hidden="true">
      {icon}
    </span>
    <p className="mt-1 text-sm font-bold text-ink">{title}</p>
    <p className="max-w-xs text-xs leading-relaxed text-ink-mute">{body}</p>
    {action && <div className="mt-2">{action}</div>}
  </div>
);

const CardHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="card-title">{title}</h2>
      {subtitle && <p className="card-sub">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Dashboard: React.FC = () => {
  const { leads, setActiveTab, companySettings } = useApp();

  const count = (status: Lead['status']): number => leads.filter((lead) => lead.status === status).length;
  const total = leads.length;
  const scheduled = count('Inspection Scheduled');
  const estimates = count('Estimate Sent');
  const won = count('Closed-Won');
  const lost = count('Closed-Lost');
  const closed = won + lost;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : null;
  const share = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);

  const stageData: ChartDatum[] = STAGES.map((s) => ({ label: s.status, value: count(s.status), color: s.color }));

  const statusMix: ChartDatum[] = [
    { label: 'New & in contact', value: count('New Lead') + count('Contacted') + count('In Contact'), color: GOLD },
    { label: 'Inspection', value: scheduled + count('Inspection Completed'), color: GREEN },
    { label: 'Estimate sent', value: estimates, color: VIOLET },
    { label: 'Won', value: won, color: SKY },
    { label: 'Lost / on hold', value: lost + count('Closed') + count('Follow-up Nurture'), color: STONE },
  ];

  const bySource: ChartDatum[] = (['Chatbot', 'Phone Call', 'Email Nurture', 'Estimate Follow-Up'] as const).map((type, i) => ({
    label: type,
    value: leads.filter((lead) => lead.agentType === type).length,
    color: [GOLD, SKY, GREEN, VIOLET][i],
  }));

  const upcoming = leads
    .filter((lead) => lead.status === 'Inspection Scheduled')
    .sort((a, b) => (a.appointmentDetails?.date ?? '9999').localeCompare(b.appointmentDetails?.date ?? '9999'))
    .slice(0, 4);

  const recent = leads.slice(0, 6);
  const company = companySettings.companyName.trim();

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Intro */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" aria-label="Overview">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {company ? `${company} overview` : 'Your sales overview'}
          </h2>
          <p className="mt-1 text-sm text-ink-mute">Every lead your AI agents captured, and where it stands today.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setActiveTab('agent1')} className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <MessageSquare className="h-4 w-4" aria-hidden="true" /> Try the chatbot
          </button>
          <button type="button" onClick={() => setActiveTab('crm')} className="btn-accent inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            Open CRM <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Key figures">
        <KpiCard
          label="Captured leads"
          value={total}
          hint="Across all four agents"
          accent={GOLD}
          icon={<Users className="h-[1.15rem] w-[1.15rem]" />}
        />
        <KpiCard
          label="Inspections booked"
          value={scheduled}
          hint={total > 0 ? `${String(share(scheduled))}% of all leads` : 'Waiting for the first booking'}
          accent={GREEN}
          share={share(scheduled)}
          icon={<CalendarCheck className="h-[1.15rem] w-[1.15rem]" />}
        />
        <KpiCard
          label="Estimates sent"
          value={estimates}
          hint={total > 0 ? `${String(share(estimates))}% of all leads` : 'Sent from the estimate agent'}
          accent={VIOLET}
          share={share(estimates)}
          icon={<FileText className="h-[1.15rem] w-[1.15rem]" />}
        />
        <KpiCard
          label="Jobs won"
          value={won}
          hint={winRate === null ? 'Win rate appears after the first close' : `${String(winRate)}% win rate on closed leads`}
          accent={SKY}
          share={winRate ?? 0}
          icon={<Trophy className="h-[1.15rem] w-[1.15rem]" />}
        />
      </section>

      {total === 0 ? (
        <section className="card card-pad" aria-label="Get started">
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="No leads yet"
            body="Run a conversation with the chatbot, or add the website widget in Configuration. Leads and charts appear here as they arrive."
            action={
              <button type="button" onClick={() => setActiveTab('agent1')} className="btn-accent inline-flex items-center gap-2 px-4 py-2.5 text-sm">
                Open the chatbot <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            }
          />
        </section>
      ) : (
        <>
          {/* Charts */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6" aria-label="Pipeline charts">
            <div className="card card-pad min-w-0 lg:col-span-3">
              <CardHeader title="Leads by stage" subtitle="Where every lead sits in the pipeline right now" />
              <BarList title="Leads by pipeline stage" data={stageData} />
            </div>
            <div className="card card-pad flex min-w-0 flex-col lg:col-span-2">
              <CardHeader title="Pipeline mix" subtitle="Share of leads by outcome" />
              <div className="flex flex-1 items-center">
                <Donut title="Pipeline mix" data={statusMix} centerValue={String(total)} centerLabel="Leads" />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
                <div>
                  <dt className="eyebrow">In progress</dt>
                  <dd className="tabular mt-1 text-lg font-extrabold text-ink">{total - closed - count('Closed') - count('Follow-up Nurture')}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Win rate</dt>
                  <dd className="tabular mt-1 text-lg font-extrabold text-ink">{winRate === null ? '—' : `${String(winRate)}%`}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Lists */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6" aria-label="Recent activity">
            <div className="card card-pad min-w-0 lg:col-span-3">
              <CardHeader
                title="Recent leads"
                subtitle="Newest first"
                action={
                  <button type="button" onClick={() => setActiveTab('crm')} className="min-h-0 shrink-0 text-xs font-bold text-accent-400 hover:text-accent-300">
                    View all
                  </button>
                }
              />
              <ul className="divide-y divide-line/80">
                {recent.map((lead) => (
                  <li key={lead.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar name={lead.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{lead.name}</p>
                      <p className="truncate text-xs text-ink-mute">{lead.roofIssue || lead.agentType}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`status-pill ${statusPillClass(lead.status)}`}>{lead.status}</span>
                      <time className="text-[11px] text-ink-mute">{lead.chatLog[0]?.timestamp || '—'}</time>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
              <div className="card card-pad">
                <CardHeader title="Upcoming inspections" subtitle="Booked by your agents" />
                {upcoming.length === 0 ? (
                  <EmptyState
                    icon={<CalendarCheck className="h-5 w-5" />}
                    title="Nothing booked yet"
                    body="When a lead agrees to an inspection it shows up here with the date."
                  />
                ) : (
                  <ul className="space-y-3">
                    {upcoming.map((lead) => (
                      <li key={lead.id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300" aria-hidden="true">
                          <CalendarCheck className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{lead.name}</p>
                          <p className="truncate text-xs text-ink-mute">{formatInspection(lead)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card card-pad">
                <CardHeader title="Lead source" subtitle="Which agent captured them" />
                <BarList title="Leads by capturing agent" data={bySource} />
              </div>
            </div>
          </section>
        </>
      )}

      <LiveLeadsStrip />
    </div>
  );
};
