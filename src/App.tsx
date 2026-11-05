import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { BillingProvider } from './context/BillingContext';
import { UpgradeModal } from './components/UpgradeModal';
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
import { usePlan } from './lib/usePlan';
import { canAccess, fallbackTab } from './lib/planAccess';
import { StatusBanner } from './components/StatusBanner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FullScreenSpinner } from './components/Spinner';
import { useOnboardingStatus } from './lib/useOnboardingStatus';
import { AuthPage } from './components/auth/AuthPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Redirect } from './components/Redirect';
import { LandingPage } from './components/public/LandingPage';
import { usePath } from './lib/router';
import OnboardingWizard from './components/OnboardingWizard';

function MainAppContent() {
  const { activeTab: requestedTab } = useApp();
  const plan = usePlan();
  const { user, configured } = useAuth();
  const { status: onboarding, markComplete } = useOnboardingStatus(user?.id ?? null, configured);

  const activeTab = canAccess(plan, requestedTab)
    ? requestedTab
    : fallbackTab();

  // One-time company info: asked only if this account has never completed it.
  if (onboarding === 'checking') return <FullScreenSpinner label="Loading your account…" />;
  if (onboarding === 'needed') return <OnboardingWizard onComplete={markComplete} />;

  const renderContent = () => {
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
        return <Dashboard />;
    }
  };

  return (
    <Layout>
      <StatusBanner />
      <div key={activeTab} className="animate-tab-in h-full">
        {renderContent()}
      </div>
      <FallbackNotice />
      <UpgradeModal />
    </Layout>
  );
}

function Routes() {
  const path = usePath();

  switch (path) {
    case '/':
      return <LandingPage />;
    case '/login':
      return <AuthPage mode="login" />;
    case '/signup':
      return <AuthPage mode="signup" />;
    case '/app':
      return (
        <ProtectedRoute>
          <AppProvider>
            <BillingProvider>
              <MainAppContent />
            </BillingProvider>
          </AppProvider>
        </ProtectedRoute>
      );
    default:
      return <Redirect to="/" />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </ErrorBoundary>
  );
}
