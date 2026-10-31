import React, { useState } from 'react';
import { CalendarDays, CloudLightning, LogOut, Menu, MessageSquare, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { CalendarConnection } from './CalendarConnection';

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { id: 'agent1', label: 'Chatbot', icon: MessageSquare },
  { id: 'crm', label: 'CRM board', icon: Users },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { activeTab, setActiveTab, companySettings, storageState, storageError } = useApp();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const leaveWorkspace = async () => {
    setSignOutError(null);
    try {
      await signOut();
      window.location.assign('/');
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
    }
  };

  return (
    <div className="workspace-shell">
      {mobileOpen && <button className="workspace-overlay" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`workspace-sidebar ${mobileOpen ? 'workspace-sidebar--open' : ''}`}>
        <div className="workspace-brand">
          <span className="workspace-brand__mark"><CloudLightning aria-hidden="true" /></span>
          <span>
            <strong>Roof<span>Flow</span> AI</strong>
            <small>Roofing lead workspace</small>
          </span>
          <button className="icon-button workspace-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="workspace-nav" aria-label="Workspace">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`workspace-nav__item ${activeTab === id ? 'is-active' : ''}`}
              onClick={() => {
                setActiveTab(id);
                setMobileOpen(false);
                window.history.pushState({}, '', id === 'crm' ? '/app/crm' : '/app/chatbot');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        <div className="workspace-sidebar__footer">
          <p>Signed in as</p>
          <strong title={user?.email ?? ''}>{user?.email ?? 'Contractor account'}</strong>
          <button className="workspace-signout" onClick={() => void leaveWorkspace()}>
            <LogOut aria-hidden="true" /> Sign out
          </button>
          {signOutError && <p className="inline-error" role="alert">{signOutError}</p>}
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-header">
          <button className="icon-button workspace-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </button>
          <div className="workspace-header__identity">
            <span className="eyebrow">CONTRACTOR WORKSPACE</span>
            <strong>{companySettings.companyName}</strong>
          </div>
          <div className="workspace-header__actions">
            <CalendarConnection />
          </div>
        </header>

        {storageError && (
          <div className="workspace-alert" role="alert">
            <span>{storageError}</span>
            <CalendarDays aria-hidden="true" />
          </div>
        )}
        {storageState === 'loading' && (
          <div className="workspace-loading" role="status">Loading your secure workspace…</div>
        )}
        {storageState !== 'loading' && (
          <main className="workspace-content">
            {children}
          </main>
        )}
      </div>
    </div>
  );
};
