import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  LayoutDashboard, 
  MessageSquare, 
  PhoneCall, 
  MessageSquarePlus, 
  FileText, 
  Users, 
  Settings, 
  Terminal,
  CloudLightning,
  Calendar
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { companySettings, activeTab, setActiveTab, leads } = useApp();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'agent1', label: 'Agent 1: Chatbot', icon: MessageSquare },
    { id: 'agent2', label: 'Agent 2: Phone Call', icon: PhoneCall },
    { id: 'agent3', label: 'Agent 3: SMS & Email', icon: MessageSquarePlus },
    { id: 'agent4', label: 'Agent 4: Estimate Follow-up', icon: FileText },
    { id: 'crm', label: 'CRM Leads Board', icon: Users },
    { id: 'config', label: 'Configuration', icon: Settings },
    { id: 'prompts', label: 'Prompt Playground', icon: Terminal },
  ];

  const totalLeads = leads.length;
  const scheduledInspections = leads.filter(l => l.status === 'Inspection Scheduled').length;

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-80 bg-[#1e293b] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Sidebar Header */}
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3 bg-gradient-to-r from-[#1e293b] to-slate-900">
            <div className="bg-orange-500 p-2.5 rounded-lg shadow-lg shadow-orange-500/20">
              <CloudLightning className="h-6 w-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1">
                Roof<span className="text-orange-500">Flow</span>
                <span className="text-xs bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">AI</span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">Contractor Sales Suite</p>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-orange-500 text-slate-950 font-bold shadow-lg shadow-orange-500/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-slate-950 stroke-[2.5]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-500 flex items-center justify-between">
          <span>v1.0.0 Ratified Plan</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-[#1e293b] border-b border-slate-800 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
          {/* Company Context */}
          <div className="flex items-center space-x-6 text-sm">
            <div>
              <span className="text-slate-400 font-medium text-xs block uppercase tracking-wider">Contractor Profile</span>
              <span className="text-white font-bold text-base">{companySettings.companyName}</span>
            </div>
            <div className="h-8 w-[1px] bg-slate-800"></div>
            <div>
              <span className="text-slate-400 font-medium text-xs block uppercase tracking-wider">Service Market</span>
              <span className="text-white font-semibold">{companySettings.city}</span>
            </div>
            <div className="h-8 w-[1px] bg-slate-800"></div>
            <div className="flex items-center space-x-2">
              <div className="bg-red-500/10 text-red-400 p-1 rounded">
                <CloudLightning className="h-4 w-4" />
              </div>
              <div>
                <span className="text-slate-400 font-medium text-xs block uppercase tracking-wider">Active Event Nurture</span>
                <span className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                  {companySettings.stormName} <span className="text-slate-400 font-mono font-normal">({companySettings.stormDate})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center space-x-3">
            <div className="bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-xl flex items-center space-x-3">
              <Users className="h-4 w-4 text-orange-500" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Total Leads</span>
                <span className="text-sm text-slate-100 font-bold font-mono">{totalLeads}</span>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-xl flex items-center space-x-3">
              <Calendar className="h-4 w-4 text-emerald-500" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Scheduled Inspections</span>
                <span className="text-sm text-slate-100 font-bold font-mono">{scheduledInspections}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Panel Viewport */}
        <main className="flex-1 overflow-y-auto p-8 bg-[#0f172a]">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
