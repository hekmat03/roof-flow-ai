
import React, { useState } from 'react';
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
  CreditCard,
  Wallet,
  CloudLightning,
  Calendar,
  Menu,
  X,
  Lock,
  LogOut,
  Sparkles
} from 'lucide-react';
import { featureAllowed, tabToFeature, upgradeLabel, type FeatureId } from '../lib/planAccess';
import { navigate } from '../lib/navigate';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { companySettings, activeTab, setActiveTab, leads, plan, signOut, chatsUsed, chatsLimit } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems: Array<{ id: string; label: string; icon: typeof LayoutDashboard; feature: FeatureId }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, feature: 'dashboard' },
    { id: 'agent1', label: 'Agent 1: Chatbot', icon: MessageSquare, feature: 'agent1' },
    { id: 'agent2', label: 'Agent 2: Phone Call', icon: PhoneCall, feature: 'agent2' },
    { id: 'agent3', label: 'Agent 3: SMS & Email', icon: MessageSquarePlus, feature: 'agent3' },
    { id: 'agent4', label: 'Agent 4: Estimate Follow-up', icon: FileText, feature: 'agent4' },
    { id: 'crm', label: 'CRM Leads Board', icon: Users, feature: 'crm' },
    { id: 'pricing', label: 'Plans & Pricing', icon: Wallet, feature: 'pricing' },
    { id: 'billing', label: 'Billing & Account', icon: CreditCard, feature: 'billing' },
    { id: 'config', label: 'Configuration', icon: Settings, feature: 'config' },
    { id: 'prompts', label: 'Prompt Playground', icon: Terminal, feature: 'prompts' },
  ];

  const totalLeads = leads.length;
  const scheduledInspections = leads.filter(l => l.status === 'Inspection Scheduled').length;
  const upgrade = upgradeLabel(plan);

  function handleTabSelect(id: string) {
    setActiveTab(id);
    setMobileMenuOpen(false);
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative panel-bg">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:static z-40 h-full w-72 md:w-80 bg-slate-950/85 md:bg-slate-950 backdrop-blur-xl
          border-r border-slate-800/80 flex flex-col justify-between shrink-0
          transition-transform duration-300 ease-out
          ${mobileMenuOpen ? 'translate-x-0 drawer-in' : '-translate-x-full'} md:translate-x-0
        `}
      >
        <div className="min-h-0 flex-1 overflow-y-auto premium-scroll">
          <div className="p-4 md:p-6 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900/70 to-slate-900/20">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="bg-gradient-to-br from-accent-400 to-accent-600 p-2.5 rounded-xl shadow-lg shadow-accent-500/30 animate-glow-breathe">
                <CloudLightning className="h-6 w-6 text-slate-950 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-black tracking-tight text-white flex items-center gap-1">
                  Roof<span className="text-accent-400">Flow</span>
                  <span className="text-[10px] bg-accent-500/10 text-accent-300 px-1.5 py-0.5 rounded-md font-mono font-bold uppercase tracking-wider border border-accent-500/20">AI</span>
                </h1>
                <p className="text-xs text-slate-400 font-medium truncate">{plan} plan · {chatsUsed}/{chatsLimit} chats</p>
              </div>
            </div>
            <button className="md:hidden text-slate-300 hover:text-white transition min-h-0" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="p-3 md:p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const locked = !featureAllowed(plan, item.feature || tabToFeature(item.id));
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabSelect(item.id)}
                  className={`nav-item ${isActive ? 'nav-item-active' : ''} ${locked ? 'opacity-80' : ''}`}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-accent-400' : 'text-slate-500'}`} />
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {locked ? <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 space-y-3">
          {upgrade ? (
            <button
              type="button"
              onClick={() => handleTabSelect('pricing')}
              className="btn-accent w-full px-3 py-2.5 text-xs inline-flex items-center justify-center gap-2"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {upgrade}
            </button>
          ) : null}
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span className="font-semibold tracking-wide">v1.0.0 SaaS</span>
            <span className="flex h-2 w-2 relative" title="Online">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <button
            type="button"
            className="w-full text-xs text-slate-400 hover:text-white flex items-center gap-2 min-h-0 py-2"
            onClick={() => void signOut().then(() => navigate('/'))}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
        <header className="relative z-20 h-auto md:h-20 glass-strong flex items-center justify-between px-4 md:px-8 py-3 md:py-0 shrink-0 gap-4">
          <button
            className="md:hidden text-slate-200 shrink-0 bg-slate-800/70 border border-slate-700/70 rounded-xl px-3 flex items-center justify-center hover:bg-slate-700/70 transition active:scale-95"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center space-x-6 text-sm overflow-x-auto no-scrollbar min-w-0">
            <div className="shrink-0">
              <span className="text-slate-400 font-medium text-xs block uppercase tracking-wider">Contractor Profile</span>
              <span className="text-white font-bold text-base truncate max-w-[40vw] block">{companySettings.companyName}</span>
            </div>
            <div className="h-8 w-[1px] bg-slate-700/70 hidden sm:block shrink-0"></div>
            <div className="shrink-0 hidden sm:block">
              <span className="text-slate-400 font-medium text-xs block uppercase tracking-wider">Service Market</span>
              <span className="text-white font-semibold">{companySettings.city}</span>
            </div>
            <div className="h-8 w-[1px] bg-slate-700/70 hidden lg:block shrink-0"></div>
            <div className="flex items-center space-x-2 shrink-0 hidden lg:flex">
              <div className="bg-red-500/10 text-red-400 p-1 rounded-lg border border-red-500/10">
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

          <div className="hidden sm:flex items-center space-x-3 shrink-0">
            <div className="bg-slate-900/50 border border-slate-800/80 px-3 md:px-4 py-2 rounded-xl flex items-center space-x-2 md:space-x-3 backdrop-blur-md">
              <Users className="h-4 w-4 text-accent-400" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Total Leads</span>
                <span className="text-sm text-slate-100 font-bold font-mono">{totalLeads}</span>
              </div>
            </div>
            <div className="hidden md:flex bg-slate-900/50 border border-slate-800/80 px-4 py-2 rounded-xl items-center space-x-3 backdrop-blur-md">
              <Calendar className="h-4 w-4 text-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Scheduled Inspections</span>
                <span className="text-sm text-slate-100 font-bold font-mono">{scheduledInspections}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 premium-scroll">
          <div className="max-w-7xl mx-auto h-full min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
