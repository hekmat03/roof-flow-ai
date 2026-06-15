import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  Calendar, 
  TrendingUp, 
  Zap, 
  ArrowRight, 
  MessageSquare, 
  PhoneCall, 
  MessageSquarePlus, 
  FileText,
  AlertTriangle,
  BadgeDollarSign
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { leads, setActiveTab, companySettings } = useApp();

  const totalLeads = leads.length;
  const scheduledInspections = leads.filter(l => l.status === 'Inspection Scheduled').length;
  const followUpLeads = leads.filter(l => l.status === 'Follow-up Nurture').length;
  
  // Calculate a realistic pipeline estimation
  // Assuming a 35% close rate on scheduled inspections and $12,000 average roof job value
  const estimatedRevenue = scheduledInspections * 12000 * 0.35;

  const agents = [
    {
      id: 'agent1',
      number: '1',
      title: 'Website Lead Chatbot',
      description: 'Conversational web-widget that captures storm leads 24/7 and qualifies homeowner status.',
      status: 'Active',
      metric: '35% booking rate',
      color: 'from-amber-500 to-orange-600',
      icon: MessageSquare,
    },
    {
      id: 'agent2',
      number: '2',
      title: 'Inbound Call Handler',
      description: 'Interactive voice agent handling call flows, insurance queries, and booking inspections.',
      status: 'Active',
      metric: '<15s avg response',
      color: 'from-orange-500 to-red-600',
      icon: PhoneCall,
    },
    {
      id: 'agent3',
      number: '3',
      title: 'SMS & Email Nurturer',
      description: 'Automated 7-day multi-channel follow-up sequencers reacting to user replies instantly.',
      status: 'Active',
      metric: '18% reactivation',
      color: 'from-yellow-500 to-amber-600',
      icon: MessageSquarePlus,
    },
    {
      id: 'agent4',
      number: '4',
      title: 'Estimate Follow-up',
      description: 'Follow-up on repair estimates to handle financing, budget, and competitor objections.',
      status: 'Active',
      metric: '+25% closing boost',
      color: 'from-amber-600 to-red-600',
      icon: FileText,
    }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-[#1e293b] to-slate-900 border border-slate-800 rounded-2xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp className="h-48 w-48 text-orange-500" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <span className="bg-orange-500/10 text-orange-400 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border border-orange-500/20">
            RoofFlow Sales Console
          </span>
          <h2 className="text-3xl font-extrabold text-white mt-4">
            Maximize Storm Damage Leads with <span className="text-orange-500">Autonomous Sales Agents</span>
          </h2>
          <p className="text-slate-300 mt-2 text-sm leading-relaxed">
            RoofFlow AI automatically monitors, qualifies, and follows up with homeowners in the <span className="font-bold text-white">{companySettings.city}</span> market, keeping scheduling books filled after severe events like the <span className="font-bold text-white">{companySettings.stormName}</span>.
          </p>
          <div className="mt-6 flex space-x-4">
            <button 
              onClick={() => setActiveTab('agent1')}
              className="bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-lg shadow-orange-500/20 flex items-center gap-2 group"
            >
              Simulate Chatbot 
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </button>
            <button 
              onClick={() => setActiveTab('crm')}
              className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition border border-slate-700"
            >
              View Leads Board
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md hover:border-slate-700 transition duration-150">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Captured Leads</p>
              <h3 className="text-3xl font-black font-mono text-white mt-1">{totalLeads}</h3>
            </div>
            <div className="bg-orange-500/10 p-3 rounded-xl">
              <Users className="h-6 w-6 text-orange-500" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-slate-400">
            <Zap className="h-3.5 w-3.5 text-orange-400 mr-1" />
            <span>24/7 Automated capture</span>
          </div>
        </div>

        <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md hover:border-slate-700 transition duration-150">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Inspections Scheduled</p>
              <h3 className="text-3xl font-black font-mono text-white mt-1">{scheduledInspections}</h3>
            </div>
            <div className="bg-emerald-500/10 p-3 rounded-xl">
              <Calendar className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-slate-400">
            <span className="text-emerald-400 font-bold mr-1 font-mono">
              {totalLeads > 0 ? Math.round((scheduledInspections / totalLeads) * 100) : 0}%
            </span>
            <span>Lead-to-Booking Rate</span>
          </div>
        </div>

        <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md hover:border-slate-700 transition duration-150">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reactivation Queue</p>
              <h3 className="text-3xl font-black font-mono text-white mt-1">{followUpLeads}</h3>
            </div>
            <div className="bg-yellow-500/10 p-3 rounded-xl">
              <MessageSquarePlus className="h-6 w-6 text-yellow-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-slate-400">
            <span>SMS/Email nurture sequences</span>
          </div>
        </div>

        <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md hover:border-slate-700 transition duration-150">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Est. Booking Revenue</p>
              <h3 className="text-3xl font-black font-mono text-orange-500 mt-1">
                ${estimatedRevenue.toLocaleString()}
              </h3>
            </div>
            <div className="bg-orange-500/10 p-3 rounded-xl">
              <BadgeDollarSign className="h-6 w-6 text-orange-500" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-slate-400">
            <span>Based on 35% close / $12k avg repair</span>
          </div>
        </div>
      </div>

      {/* Roster of 4 AI Sales Agents */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-white">Interactive AI Agent Suite</h3>
            <p className="text-xs text-slate-400 mt-1">Four specialized AI agents working together across the roofing sales pipeline</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div 
                key={agent.id}
                className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md hover:border-slate-700 transition duration-200 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${agent.color} shadow-lg shadow-orange-500/5`}>
                      <Icon className="h-5 w-5 text-slate-950 stroke-[2.5]" />
                    </div>
                    <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 font-mono font-bold px-2 py-0.5 rounded-md uppercase">
                      Agent {agent.number}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white group-hover:text-orange-400 transition">
                    {agent.title}
                  </h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {agent.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block font-semibold uppercase tracking-wider text-[9px]">KPI Metric</span>
                    <span className="text-slate-200 font-bold font-mono">{agent.metric}</span>
                  </div>
                  <button 
                    onClick={() => setActiveTab(agent.id)}
                    className="bg-slate-800 hover:bg-orange-500 hover:text-slate-950 text-slate-300 font-bold px-3 py-1.5 rounded-lg transition-all duration-150 flex items-center gap-1"
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

      {/* Bottom Row: Recent Leads & Active Storm Warnings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Recent Leads (Left/Mid) */}
        <div className="md:col-span-2 bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-white">Latest Pipeline Inflow</h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time leads automatically qualified by active agents</p>
            </div>
            <button 
              onClick={() => setActiveTab('crm')}
              className="text-xs text-orange-500 hover:text-orange-400 font-bold flex items-center gap-1.5"
            >
              Open CRM Board
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-800">
            {leads.slice(0, 4).map((lead) => (
              <div key={lead.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                <div className="flex items-center space-x-3.5">
                  <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-orange-500">
                    {lead.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{lead.name}</h4>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>{lead.email}</span>
                      <span className="text-slate-600">•</span>
                      <span>{lead.phone}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block font-semibold uppercase tracking-wider">Acquired via</span>
                    <span className="text-xs text-slate-300 font-medium">{lead.agentType}</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    lead.status === 'Inspection Scheduled' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
                      : lead.status === 'Follow-up Nurture'
                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/10'
                      : 'bg-orange-500/10 text-orange-400 border-orange-500/10'
                  }`}>
                    {lead.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Storm/Objection Focus (Right) */}
        <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-orange-400 mb-4 bg-orange-500/10 p-3 rounded-xl border border-orange-500/20">
              <AlertTriangle className="h-5 w-5 stroke-[2.5]" />
              <span className="text-xs font-bold uppercase tracking-wider">Storm Objection Vector</span>
            </div>
            <h3 className="text-base font-bold text-white">Local Target Event Analysis</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              AI agents are currently programmed to inject references to the <span className="text-slate-200 font-bold">{companySettings.stormName}</span> that impacted the <span className="text-slate-200 font-bold">{companySettings.city}</span> region on <span className="text-slate-200 font-bold">{companySettings.stormDate}</span>.
            </p>
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 mt-4 space-y-2 font-mono leading-relaxed">
              <p className="text-orange-400 font-bold uppercase tracking-wider text-[9px] mb-1">Active AI Objection Script</p>
              {`Most insurance policies have a 1-year filing limit from the event date (${companySettings.stormDate}). We provide a free inspection report so you don't miss the deadline.`}
            </div>
          </div>

          <button 
            onClick={() => setActiveTab('config')}
            className="w-full mt-6 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs py-2.5 rounded-xl border border-slate-700 transition"
          >
            Adjust Target Event Settings
          </button>
        </div>
      </div>
    </div>
  );
};
