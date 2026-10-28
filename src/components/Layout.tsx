import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
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
  Sun,
  Moon
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { companySettings, activeTab, setActiveTab, leads } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'agent1', label: 'Agent 1: Chatbot', icon: MessageSquare },
    { id: 'agent2', label: 'Agent 2: Phone Call', icon: PhoneCall },
    { id: 'agent3', label: 'Agent 3: SMS & Email', icon: MessageSquarePlus },
    { id: 'agent4', label: 'Agent 4: Estimate Follow-up', icon: FileText },
    { id: 'crm', label: 'CRM Leads Board', icon: Users },
    { id: 'pricing', label: 'Plans & Pricing', icon: Wallet },
    { id: 'billing', label: 'Billing & Account', icon: CreditCard },
    { id: 'config', label: 'Configuration', icon: Settings },
    { id: 'prompts', label: 'Prompt Playground', icon: Terminal },
  ];

  const totalLeads = leads.length;
  const scheduledInspections = leads.filter(l => l.status === 'Inspection Scheduled').length;

  function handleTabSelect(id: string) {
    setActiveTab(id);
    setMobileMenuOpen(false); // auto-close menu on mobile after picking a tab
  }

  return (
    <div className="flex h-screen bg-page text-ink overflow-hidden font-sans relative panel-bg">
      {/* Mobile overlay (click to close menu) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static z-40 h-full w-72 md:w-80 bg-card
          border-r border-line flex flex-col justify-between shrink-0
          transition-transform duration-300 ease-out
          ${mobileMenuOpen ? 'translate-x-0 drawer-in' : '-translate-x-full'} md:translate-x-0
        `}
      >
        <div>
          {/* Sidebar Header */}
          <div className="p-4 md:p-6 border-b border-line flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gold p-2.5 rounded-xl shadow-lg">
                <CloudLightning className="h-6 w-6 text-gold-ink stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-black tracking-tight text-ink flex items-center gap-1">
                  Roof<span className="text-accent-400">Flow</span>
                  <span className="text-[10px] bg-accent-500/10 text-accent-400 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest border border-accent-500/25">AI</span>
                </h1>
                <p className="text-xs text-ink-mute font-medium">Contractor Sales Suite</p>
              </div>
            </div>
            {/* Close button, mobile only */}
            <button className="md:hidden text-ink-mute hover:text-ink transition min-h-0" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-3 md:p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabSelect(item.id)}
                  className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-accent-400' : 'text-ink-mute'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-line text-xs text-ink-mute flex items-center justify-between">
          <span className="font-semibold">RoofFlow AI Suite v1.1</span>
          <span className="flex h-2 w-2 relative" title="Live console">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Top Header */}
        <header className="relative z-20 h-auto md:h-20 bg-card border-b border-line flex items-center justify-between px-4 md:px-8 py-3 md:py-0 shrink-0 gap-4">
          {/* Hamburger, mobile only */}
          <button
            className="md:hidden text-ink shrink-0 surface-inset px-3 flex items-center justify-center hover:border-accent-400 transition active:scale-95 min-h-0"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Company Context — scrolls horizontally on small screens instead of overflowing */}
          <div className="flex items-center space-x-5 md:space-x-6 text-sm overflow-hidden min-w-0 flex-1">
            <div className="shrink-0">
              <span className="label-micro block">Contractor Profile</span>
              <span className="text-ink font-bold text-base">{companySettings.companyName}</span>
            </div>
            <div className="h-8 w-[1px] bg-line hidden sm:block shrink-0"></div>
            <div className="shrink-0 hidden sm:block">
              <span className="label-micro block">Service Market</span>
              <span className="text-ink font-semibold">{companySettings.city}</span>
            </div>
            <div className="h-8 w-[1px] bg-line hidden lg:block shrink-0"></div>
            <div className="items-center space-x-2 min-w-0 hidden xl:flex">
              <div className="bg-accent-500/10 text-accent-400 p-1.5 rounded-lg border border-accent-500/25">
                <CloudLightning className="h-4 w-4" />
              </div>
              <div>
                <span className="label-micro block">Active Event Nurture</span>
                <span className="text-ink-soft font-semibold text-xs flex items-center gap-1.5 min-w-0">
                  <span className="truncate max-w-[13rem]">{companySettings.stormName}</span>
                  <span className="text-ink-mute font-normal shrink-0">({companySettings.stormDate})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Theme toggle + quick metrics */}
          <div className="flex items-center space-x-2 md:space-x-3 shrink-0 ml-auto">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle shrink-0"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'Cream' : 'Obsidian'} theme`}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Cream' : 'Obsidian'}</span>
            </button>

            {/* Quick Metrics — hidden on the smallest screens to save space */}
            <div className="hidden sm:flex items-center space-x-3 shrink-0">
              <div className="surface-inset px-3 md:px-4 py-2 flex items-center space-x-2 md:space-x-3">
                <Users className="h-4 w-4 text-accent-400" />
                <div>
                  <span className="label-micro block">Total Leads</span>
                  <span className="text-sm text-ink font-bold">{totalLeads}</span>
                </div>
              </div>
              <div className="hidden lg:flex surface-inset px-4 py-2 items-center space-x-3 shrink-0">
                <Calendar className="h-4 w-4 text-accent-400" />
                <div>
                  <span className="label-micro block">Inspections</span>
                  <span className="text-sm text-ink font-bold">{scheduledInspections}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Panel Viewport */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 premium-scroll">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
