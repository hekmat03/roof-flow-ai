import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  MessageSquare,
  PhoneCall,
  MessageSquarePlus,
  FileText,
  Users,
  Settings,
  ShieldCheck,
  CloudLightning,
  Menu,
  X,
  LogOut,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../lib/router';
import { CalendarConnection } from './CalendarConnection';

interface LayoutProps {
  children: React.ReactNode;
}

type NavIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

interface NavItem {
  id: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  short: string;
  icon: NavIcon;
  /** Shows a "Soon" tag: the feature is a demo only and not live yet. */
  soon?: boolean;
}

// Tab ids are unchanged; only the grouping and labels are new.
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard }],
  },
  {
    label: 'AI agents',
    items: [
      { id: 'agent1', label: 'Chatbot', short: 'Chat', icon: MessageSquare },
      { id: 'agent2', label: 'Phone call', short: 'Phone', icon: PhoneCall, soon: true },
      { id: 'agent3', label: 'Email follow-ups', short: 'Email', icon: MessageSquarePlus },
      { id: 'agent4', label: 'Estimate follow-up', short: 'Estimate', icon: FileText },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { id: 'crm', label: 'CRM leads board', short: 'Leads', icon: Users },
      { id: 'team', label: 'Team & users', short: 'Team', icon: ShieldCheck },
      { id: 'config', label: 'Configuration', short: 'Settings', icon: Settings },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
const BOTTOM_TABS = ['dashboard', 'crm', 'agent1'];

function initialsOf(value: string | undefined | null): string {
  const base = (value ?? '').split('@')[0].replace(/[^a-zA-Z0-9 ._-]/g, '');
  const parts = base.split(/[ ._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)) || 'RF';
  return letters.toUpperCase();
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { companySettings, activeTab, setActiveTab, activeCompany, availableCompanies, switchCompany } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/login', true);
  }

  function handleTabSelect(id: string) {
    setActiveTab(id);
    setMobileMenuOpen(false);
  }

  // Drawer: Escape closes it, focus moves in, and returns to the menu button on close.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const first = drawerRef.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const button = menuButtonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [mobileMenuOpen]);

  const current = ALL_ITEMS.find((item) => item.id === activeTab) ?? ALL_ITEMS[0];
  const companyName = activeCompany?.name ?? companySettings.companyName ?? '';
  const bottomItems = BOTTOM_TABS.map((id) => ALL_ITEMS.find((item) => item.id === id)).filter(
    (item): item is NavItem => Boolean(item),
  );
  const fitScreen = ['agent1', 'agent2', 'team'].includes(activeTab);
  const bottomHasActive = bottomItems.some((item) => item.id === activeTab);

  return (
    <div className="roofflow-shell flex h-screen bg-page text-ink overflow-hidden font-sans relative panel-bg">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/55 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ------------------------------------------------------------ Sidebar */}
      <aside
        ref={drawerRef}
        aria-label="Primary"
        className={`
          fixed md:static z-40 h-full w-[17.5rem]
          bg-[#201f1c] md:bg-[#1e1d1b]
          border-r border-line flex flex-col shrink-0
          transition-[transform,visibility] duration-300 ease-out
          ${mobileMenuOpen ? 'translate-x-0 drawer-in shadow-2xl shadow-black/50' : '-translate-x-full max-md:invisible'}
          md:translate-x-0 md:shadow-none
        `}
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-3 px-5 h-[4.5rem] border-b border-line shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-accent-300 to-accent-600 shadow-lg shadow-accent-500/25">
              <CloudLightning className="h-5 w-5 text-gold-ink stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[1.05rem] leading-tight font-extrabold tracking-tight text-ink flex items-center gap-1.5">
                <span>
                  Roof<span className="text-accent-400">Flow</span>
                </span>
                <span className="text-[9px] bg-accent-500/15 text-accent-300 px-1.5 py-0.5 rounded-md font-mono font-bold uppercase tracking-wider border border-accent-500/25">
                  AI
                </span>
              </p>
              <p className="text-[11px] text-ink-mute font-medium">Contractor sales suite</p>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden grid place-items-center h-10 w-10 rounded-lg text-ink-soft hover:text-ink hover:bg-white/5 transition min-h-0"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto premium-scroll px-3 pb-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleTabSelect(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                      >
                        <Icon
                          className={`h-[1.15rem] w-[1.15rem] shrink-0 ${isActive ? 'text-accent-400' : 'text-ink-mute'}`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                        {item.soon && (
                          <span className="ml-auto shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">Soon</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Account */}
        <div className="shrink-0 border-t border-line bg-black/10 p-3 space-y-3">
          <CalendarConnection />
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-line px-3 py-2.5">
            <div
              className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-accent-500/15 text-accent-300 text-xs font-extrabold border border-accent-500/30"
              aria-hidden="true"
            >
              {initialsOf(user?.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink truncate" title={user?.email ?? ''}>
                {user?.email ?? 'Signed in'}
              </p>
              <p className="text-[11px] text-ink-mute truncate">{companyName || 'Your workspace'}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label={signingOut ? 'Signing out' : 'Sign out'}
              title="Sign out"
              className="grid place-items-center h-9 w-9 shrink-0 rounded-lg text-ink-soft hover:text-ink hover:bg-white/10 disabled:opacity-60 transition min-h-0"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------- Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="relative z-20 glass-strong flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-16 md:h-[4.5rem] shrink-0">
          <button
            ref={menuButtonRef}
            type="button"
            className="md:hidden grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-white/[0.06] border border-line text-ink hover:bg-white/10 transition active:scale-95 min-h-0"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="min-w-0">
            <p className="eyebrow hidden sm:block">{companyName || 'RoofFlow AI'}</p>
            <h1 className="text-base sm:text-lg font-extrabold text-ink leading-tight truncate">{current.label}</h1>
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-5 min-w-0">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-ink-soft">
              <MapPin className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
              <span className="font-semibold truncate max-w-[14rem]">
                {companySettings.city || 'Dallas-Fort Worth, TX'}
              </span>
            </div>

            <div className="hidden lg:block h-7 w-px bg-line-strong/70" aria-hidden="true" />

            <div className="min-w-0">
              <label htmlFor="workspace-select" className="sr-only-text">
                Active company workspace
              </label>
              <select
                id="workspace-select"
                value={activeCompany?.id ?? ''}
                onChange={(e) => void switchCompany(e.target.value)}
                className="max-w-[10.5rem] sm:max-w-[16rem] truncate rounded-lg bg-white/[0.06] border border-line hover:border-accent-500/50 text-ink font-semibold text-xs sm:text-sm px-3 py-2 cursor-pointer outline-none transition focus-visible:border-accent-400 min-h-0"
              >
                {availableCompanies.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className={`flex-1 overflow-y-auto premium-scroll px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-6 pb-24 md:pb-8 outline-none ${fitScreen ? 'lg:overflow-hidden' : ''}`}
        >
          <div className="max-w-7xl mx-auto h-full">{children}</div>
        </main>

        {/* ------------------------------------------- Mobile bottom tab bar */}
        <nav
          aria-label="Quick navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-line bg-[#201f1c]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-4">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleTabSelect(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition min-h-[3.5rem] ${
                      isActive ? 'text-accent-300' : 'text-ink-mute hover:text-ink'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'drop-shadow-[0_0_6px_rgb(236_211_138/0.5)]' : ''}`} aria-hidden="true" />
                    {item.short}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`w-full flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition min-h-[3.5rem] ${
                  !bottomHasActive ? 'text-accent-300' : 'text-ink-mute hover:text-ink'
                }`}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
                More
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
};
