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
  CreditCard,
  Wallet,
  CloudLightning,
  Menu,
  X,
  Lock,
  LogOut
} from 'lucide-react';
import { usePlan } from '../lib/usePlan';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../lib/router';
import { canAccess, upgradeLabel, isHidden, requiredPlan, PLAN_NAMES } from '../lib/planAccess';
import { useBilling } from '../context/BillingContext';
import { CalendarConnection } from './CalendarConnection';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { companySettings, activeTab, setActiveTab } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const plan = usePlan();
  const { openUpgrade } = useBilling();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/login', true);
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'agent1', label: 'Agent 1: Chatbot', icon: MessageSquare },
    { id: 'agent2', label: 'Agent 2: Phone Call', icon: PhoneCall },
    { id: 'agent3', label: 'Agent 3: Email Follow-ups', icon: MessageSquarePlus },
    { id: 'agent4', label: 'Agent 4: Estimate Follow-up', icon: FileText },
    { id: 'crm', label: 'CRM Leads Board', icon: Users },
    { id: 'pricing', label: 'Plans & Pricing', icon: Wallet },
    { id: 'billing', label: 'Billing & Account', icon: CreditCard },
    { id: 'config', label: 'Configuration', icon: Settings },
  ];

  // Phone automation remains Pro-only. Email follow-up agents are available to Starter and Pro.
  const visibleItems = menuItems.filter((item) => !isHidden(item.id));

  function handleTabSelect(id: string) {
    if (canAccess(plan, id)) {
      setActiveTab(id);
    } else {
      // Locked: stay where you are and show the upgrade prompt.
      const needs = requiredPlan(id);
      const label = menuItems.find((m) => m.id === id)?.label ?? 'This feature';
      openUpgrade(`${label} is included in the ${needs ? PLAN_NAMES[needs] : 'Pro'} plan and above.`);
    }
    setMobileMenuOpen(false);
  }

  return (
    <div className="roofflow-shell flex h-screen bg-page text-ink overflow-hidden font-sans relative panel-bg">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-page/70 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:static z-40 h-full w-72 md:w-80
          bg-page/95 md:bg-page backdrop-blur-xl
          border-r border-line/80 flex flex-col justify-between shrink-0
          transition-transform duration-300 ease-out
          ${mobileMenuOpen ? 'translate-x-0 drawer-in' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div>
          <div className="p-4 md:p-4 border-b border-line/80 flex items-center justify-between bg-gradient-to-r from-page via-card/70 to-card/20">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-accent-400 to-accent-600 p-2.5 rounded-xl shadow-lg shadow-accent-500/30 animate-glow-breathe">
                <CloudLightning className="h-6 w-6 text-gold-ink stroke-[2.5]" />
              </div>

              <div>
                <h1 className="text-lg md:text-xl font-black tracking-tight text-ink flex items-center gap-1">
                  Roof<span className="text-accent-400">Flow</span>
                  <span className="text-[10px] bg-accent-500/10 text-accent-300 px-1.5 py-0.5 rounded-md font-mono font-bold uppercase tracking-wider border border-accent-500/20">
                    AI
                  </span>
                </h1>
                <p className="text-xs text-ink-mute font-medium">
                  Contractor Sales Suite
                </p>
              </div>
            </div>

            <button
              className="md:hidden text-ink-soft hover:text-ink transition min-h-0"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="p-3 md:p-4 space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabSelect(item.id)}
                  className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${
                      isActive ? 'text-accent-400' : 'text-ink-mute'
                    }`}
                  />

                  <span className="truncate">{item.label}</span>

                  {!canAccess(plan, item.id) && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase text-accent-400 shrink-0">
                      <Lock className="h-3.5 w-3.5" />
                      {upgradeLabel(plan)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-line/80 bg-card/40 text-xs text-ink-mute space-y-3">
          <CalendarConnection />
          <div className="truncate" title={user?.email ?? ''}>
            {user?.email}
          </div>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center justify-center gap-2 border border-line hover:border-accent-500 hover:text-ink disabled:opacity-60 rounded-lg py-2 font-semibold transition"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="relative z-20 h-auto md:h-20 glass-strong flex items-center justify-between px-4 md:px-8 py-3 md:py-0 shrink-0 gap-4">
          <button
            className="md:hidden text-ink shrink-0 bg-inset/70 border border-line/70 rounded-xl px-3 flex items-center justify-center hover:bg-line-strong/70 transition active:scale-95"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center space-x-6 text-sm overflow-x-auto no-scrollbar">
            <div className="shrink-0">
              <span className="text-ink-mute font-medium text-xs block uppercase tracking-wider">
                Contractor Profile
              </span>
              <span className="text-ink font-bold text-base">
                {companySettings.companyName}
              </span>
            </div>

            <div className="h-8 w-[1px] bg-line-strong/70 hidden sm:block shrink-0"></div>

            <div className="shrink-0 hidden sm:block">
              <span className="text-ink-mute font-medium text-xs block uppercase tracking-wider">
                Service Market
              </span>
              <span className="text-ink font-semibold">
                {companySettings.city}
              </span>
            </div>

          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-5 premium-scroll">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
