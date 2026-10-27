import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Agent1Chatbot } from './components/Agent1Chatbot';
import { Agent2PhoneCall } from './components/Agent2PhoneCall';
import { Agent3SMSEmail } from './components/Agent3SMSEmail';
import { Agent4Estimate } from './components/Agent4Estimate';
import { CRMLeadsBoard } from './components/CRMLeadsBoard';
import { Configuration } from './components/Configuration';
import { PromptPlayground } from './components/PromptPlayground';
import { BillingGateway } from './components/BillingGateway';
import { FallbackNotice } from './components/FallbackNotice';
import { LandingPage } from './components/LandingPage';
import { AuthScreen } from './components/AuthScreen';
import { UpgradeModal } from './components/UpgradeModal';
import { featureAllowed, tabToFeature } from './lib/planAccess';
import { Loader2, Mail } from 'lucide-react';
import { navigate } from './lib/navigate';

function useLocationPath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

function MainAppContent() {
  const { activeTab, plan, upgradeOpen, upgradeFeature, closeUpgrade } = useApp();

  const renderContent = () => {
    const feature = tabToFeature(activeTab);
    if (!featureAllowed(plan, feature)) {
      return <Agent1Chatbot />;
    }
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'agent1':
        return <Agent1Chatbot />;
      case 'agent2':
        return <Agent2PhoneCall />;
      case 'agent3':
        return <Agent3SMSEmail />;
      case 'agent4':
        return <Agent4Estimate />;
      case 'crm':
        return <CRMLeadsBoard />;
      case 'config':
        return <Configuration />;
      case 'prompts':
        return <PromptPlayground />;
      case 'pricing':
      case 'billing':
        return <BillingGateway view={activeTab} />;
      default:
        return plan === 'free' ? <Agent1Chatbot /> : <Dashboard />;
    }
  };

  return (
    <Layout>
      <div key={activeTab} className="animate-tab-in h-full min-w-0">
        {renderContent()}
      </div>
      <FallbackNotice />
      <UpgradeModal
        open={upgradeOpen}
        plan={plan}
        featureLabel={upgradeFeature}
        onClose={closeUpgrade}
        onUpgrade={() => {
          closeUpgrade();
          navigate('/app');
          // requestTab would recurse; set via billing tab which is always allowed
          window.setTimeout(() => {
            document.dispatchEvent(new CustomEvent('roofflow:open-pricing'));
          }, 0);
        }}
      />
    </Layout>
  );
}

function VerifyGate({ children }: { children: React.ReactNode }) {
  const { user, emailVerified, authLoading, signOut } = useApp();
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-accent-400" />
        <span>Loading your workspace…</span>
      </div>
    );
  }
  if (!user) {
    return <AuthScreen mode="login" />;
  }
  if (!emailVerified) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <Mail className="h-8 w-8 text-accent-400 mx-auto" />
          <h1 className="text-xl font-bold text-white mt-4">Verify your email</h1>
          <p className="text-sm text-slate-400 mt-2">
            We sent a confirmation link with Supabase Auth. Open it, then sign in to reach the dashboard.
          </p>
          <button type="button" className="btn-accent w-full mt-6 px-4 py-3 text-sm" onClick={() => void signOut().then(() => navigate('/login'))}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Shell() {
  const path = useLocationPath();
  const { setActiveTab } = useApp();

  useEffect(() => {
    const openPricing = () => setActiveTab('pricing');
    document.addEventListener('roofflow:open-pricing', openPricing);
    return () => document.removeEventListener('roofflow:open-pricing', openPricing);
  }, [setActiveTab]);

  if (path === '/login') return <AuthScreen mode="login" />;
  if (path === '/signup') return <AuthScreen mode="signup" />;
  if (path.startsWith('/app')) {
    return (
      <VerifyGate>
        <MainAppContent />
      </VerifyGate>
    );
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
