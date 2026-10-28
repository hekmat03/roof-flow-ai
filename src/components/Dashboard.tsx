import React from 'react';
import { useApp } from '../context/AppContext';
import { useCountUp } from '../utils/useCountUp';
import { AnalyticsCharts } from './AnalyticsCharts';
import { LiveLeadsStrip } from './LiveLeadsStrip';
import { 
  Users, 
  Calendar, 
  Zap, 
  ArrowRight, 
  MessageSquare, 
  PhoneCall, 
  MessageSquarePlus, 
  FileText,
  AlertTriangle,
  BadgeDollarSign
} from 'lucide-react';

/** Maps a CRM status to its premium .st-* pill class (10 statuses). */
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
  const { leads, setActiveTab, companySettings } = useApp();

  const totalLeads = leads.length;
  const scheduledInspections = leads.filter(l => l.status === 'Inspection Scheduled').length;
  const followUpLeads = leads.filter(l => l.status === 'Follow-up Nurture').length;

  // Calculate a realistic pipeline estimation
  // Assuming a 35% close rate on scheduled inspections and $12,000 average roof job value
  const estimatedRevenue = scheduledInspections * 12000 * 0.35;
  const bookingRate = totalLeads > 0 ? Math.round((scheduledInspections / totalLeads) * 100) : 0;

  // Count-up animated KPIs
  const animTotal = useCountUp(totalLeads);
  const animScheduled = useCountUp(scheduledInspections);
  const animFollowUp = useCountUp(followUpLeads);
  const animRevenue = useCountUp(estimatedRevenue);

  const agents = [
    {
      id: 'agent1',
      number: '1',
      title: 'Website Lead Chatbot',
      description: 'Conversational web-widget that captures storm leads 24/7 and qualifies homeowner status.',
      status: 'Active',
      metric: '35% booking rate',
      color: 'from-accent-300 to-accent-500',
      glow: 'shadow-black/10',
      icon: MessageSquare,
    },
    {
      id: 'agent2',
      number: '2',
      title: 'Inbound Call Handler',
      description: 'Interactive voice agent handling call flows, insurance queries, and booking inspections.',
      status: 'Active',
      metric: '<15s avg response',
      color: 'from-accent-400 to-accent-600',
      glow: 'shadow-black/10',
      icon: PhoneCall,
    },
    {
      id: 'agent3',
      number: '3',
      title: 'SMS & Email Nurturer',
      description: 'Automated 7-day multi-channel follow-up sequencers reacting to user replies instantly.',
      status: 'Active',
      metric: '18% reactivation',
      color: 'from-accent-300 to-accent-400',
      glow: 'shadow-black/10',
      icon: MessageSquarePlus,
    },
    {
      id: 'agent4',
      number: '4',
      title: 'Estimate Follow-up',
      description: 'Follow-up on repair estimates to handle financing, budget, and competitor objections.',
      status: 'Active',
      metric: '+25% closing boost',
      color: 'from-accent-400 to-accent-700',
      glow: 'shadow-black/10',
      icon: FileText,
    }
  ];

  const kpis = [
    {
      label: 'Captured Leads',
      value: Math.round(animTotal),
      display: String(Math.round(animTotal)),
      sub: '24/7 Automated capture',
      subIcon: Zap,
      chip: 'bg-accent-500/10 text-accent-400 border border-accent-500/20',
      icon: Users,
      iconColor: 'text-accent-400',
    },
    {
      label: 'Inspections Scheduled',
      value: Math.round(animScheduled),
      display: String(Math.round(animScheduled)),
      sub: `${bookingRate}% Lead-to-Booking Rate`,
      subIcon: null,
      chip: 'bg-accent-500/10 text-accent-400 border border-accent-500/25',
      icon: Calendar,
      iconColor: 'text-accent-400',
    },
    {
      label: 'Reactivation Queue',
      value: Math.round(animFollowUp),
      display: String(Math.round(animFollowUp)),
      sub: 'SMS/Email nurture sequences',
      subIcon: null,
      chip: 'surface-inset text-ink-soft border border-line',
      icon: MessageSquarePlus,
      iconColor: 'text-ink-soft',
    },
    {
      label: 'Est. Booking Revenue',
      value: Math.round(animRevenue),
      display: `$${Math.round(animRevenue).toLocaleString()}`,
      sub: 'Based on 35% close / $12k avg repair',
      subIcon: null,
      chip: 'bg-accent-500/10 text-accent-400 border border-accent-500/20',
      icon: BadgeDollarSign,
      iconColor: 'text-accent-400',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="glass-card hero-glow p-6 md:p-10 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 bg-accent-500/10 text-accent-400 text-[11px] px-3 py-1.5 rounded-full font-bold border border-accent-500/25 animate-pop-in">
            <Zap className="h-3 w-3" />
            RoofFlow Sales Console
          </span>
          <h2 className="text-fluid-hero font-extrabold text-ink mt-4 tracking-tight">
            Maximize Storm Damage Leads with <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-600 bg-clip-text text-transparent">Autonomous Sales Agents</span>
          </h2>
          <p className="text-ink-soft mt-2 text-fluid-body leading-relaxed">
            RoofFlow AI automatically monitors, qualifies, and follows up with homeowners in the <span className="font-bold text-ink">{companySettings.city}</span> market, keeping scheduling books filled after severe events like the <span className="font-bold text-ink">{companySettings.stormName}</span>.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0">
            <button 
              onClick={() => setActiveTab('agent1')}
              className="btn-accent px-5 py-3 text-sm flex items-center justify-center gap-2 group"
            >
              Simulate Chatbot 
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </button>
            <button 
              onClick={() => setActiveTab('crm')}
              className="btn-ghost px-5 py-3 text-sm flex items-center justify-center gap-2"
            >
              View Leads Board
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {kpis.map((kpi) => {
          const SubIcon = kpi.subIcon;
          return (
            <div key={kpi.label} className="glass-card card-hover p-5 md:p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="label-micro">{kpi.label}</p>
                  <h3 className="text-3xl font-black text-ink mt-1 count-up-flash">{kpi.display}</h3>
                </div>
                <div className={`p-3 rounded-xl ${kpi.chip}`}>
                  <kpi.icon className={`h-6 w-6 ${kpi.iconColor}`} />
                </div>
              </div>
              <div className="mt-4 flex items-center text-xs text-ink-mute">
                {SubIcon ? <SubIcon className="h-3.5 w-3.5 text-accent-400 mr-1" /> : null}
                <span>{kpi.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Analytics: Revenue Attribution + Conversion Funnel */}
      <AnalyticsCharts />
      {/* Roster of 4 AI Sales Agents */}
      <div>
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h3 className="text-fluid-title font-bold text-ink">Interactive AI Agent Suite</h3>
            <p className="text-xs text-ink-mute mt-1">Four specialized AI agents working together across the roofing sales pipeline</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div 
                key={agent.id}
                className="glass-card card-hover p-6 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${agent.color} shadow-lg ${agent.glow} group-hover:scale-105 transition-transform duration-200`}>
                      <Icon className="h-5 w-5 text-gold-ink stroke-[2.5]" />
                    </div>
                    <span className="label-micro bg-inset border border-line px-2 py-0.5 rounded-md">
                      Agent {agent.number}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-ink group-hover:text-accent-300 transition-colors duration-200">
                    {agent.title}
                  </h4>
                  <p className="text-xs text-ink-mute mt-2 leading-relaxed">
                    {agent.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-xs">
                  <div>
                    <span className="label-micro block">KPI Metric</span>
                    <span className="text-ink-soft font-bold">{agent.metric}</span>
                  </div>
                  <button 
                    onClick={() => setActiveTab(agent.id)}
                    className="btn-ghost px-3 py-2 rounded-lg flex items-center gap-1 text-xs"
                  >
                    Simulate
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real widget leads — surfaced separately from the simulator figures */}
      <LiveLeadsStrip />

      {/* Bottom Row: Recent Leads & Active Storm Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        {/* Recent Leads (Left/Mid) */}
        <div className="lg:col-span-2 glass-card card-hover p-5 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-ink">Latest Pipeline Inflow</h3>
              <p className="text-xs text-ink-mute mt-0.5">Real-time leads automatically qualified by active agents</p>
            </div>
            <button 
              onClick={() => setActiveTab('crm')}
              className="text-xs text-accent-400 hover:text-accent-300 font-bold flex items-center gap-1.5 transition-colors hover:gap-2.5"
            >
              Open CRM Board
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {leads.length === 0 && (
            <div className="py-10 text-center">
              <div className="mx-auto h-12 w-12 surface-inset flex items-center justify-center mb-3">
                <Users className="h-5 w-5 text-ink-mute" />
              </div>
              <p className="text-sm font-semibold text-ink-soft">No leads captured yet</p>
              <p className="text-xs text-ink-mute mt-1 max-w-xs mx-auto">
                Run any agent simulator above — a real lead appears here instantly, with its full
                conversation transcript. Nothing is pre-seeded.
              </p>
            </div>
          )}

          <div className="divide-y divide-line">
            {leads.slice(0, 4).map((lead, idx) => (
              <div key={lead.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0 gap-3 animate-slide-up" style={{ animationDelay: `${idx * 60}ms` }}>
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="h-10 w-10 surface-inset flex items-center justify-center font-bold text-accent-400 shrink-0">
                    {lead.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-ink truncate">{lead.name}</h4>
                    <p className="text-xs text-ink-mute flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{lead.email}</span>
                      <span className="text-ink-mute">•</span>
                      <span>{lead.phone}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <span className="label-micro block">Acquired via</span>
                    <span className="text-xs text-ink-soft font-medium">{lead.agentType}</span>
                  </div>
                  <span className={`status-pill ${statusPillClass(lead.status)}`}>
                    {lead.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Storm/Objection Focus (Right) */}
        <div className="glass-card card-hover p-5 md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-accent-400 mb-4 bg-accent-500/10 p-3 border border-accent-500/25">
              <AlertTriangle className="h-5 w-5 stroke-[2.5]" />
              <span className="label-micro">Storm Objection Vector</span>
            </div>
            <h3 className="text-base font-bold text-ink">Local Target Event Analysis</h3>
            <p className="text-xs text-ink-mute mt-2 leading-relaxed">
              AI agents are currently programmed to inject references to the <span className="text-ink-soft font-bold">{companySettings.stormName}</span> that impacted the <span className="text-ink-soft font-bold">{companySettings.city}</span> region on <span className="text-ink-soft font-bold">{companySettings.stormDate}</span>.
            </p>
            <div className="surface-inset p-3.5 text-xs text-ink-soft mt-4 space-y-2 leading-relaxed">
              <p className="label-micro mb-1 text-accent-400">Active AI Objection Script</p>
              {`Most insurance policies have a 1-year filing limit from the event date (${companySettings.stormDate}). We provide a free inspection report so you don't miss the deadline.`}
            </div>
          </div>

          <button 
            onClick={() => setActiveTab('config')}
            className="w-full mt-6 btn-ghost text-xs py-3"
          >
            Adjust Target Event Settings
          </button>
        </div>
      </div>
    </div>
  );
};
