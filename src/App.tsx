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
import { usePlan } from './lib/usePlan';
import { canAccess } from './lib/planAccess';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FullScreenSpinner } from './components/Spinner';
import { Redirect } from './components/Redirect';
import { usePath } from './lib/router';

function MainAppContent() {
  const { activeTab: requestedTab } = useApp();
  const plan = usePlan();

  // A locked tab can never render, even if something sets it directly.
  const activeTab = canAccess(plan, requestedTab)
    ? requestedTab
    : 'pricing';

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
      <div key={activeTab} className="animate-tab-in h-full">
        {renderContent()}
      </div>

      {/* Non-intrusive notice when live AI is unavailable */}
      <FallbackNotice />
    </Layout>
  );
}

/** "/" until the landing page exists (Step 5): send people where they belong. */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  return <Redirect to={user ? '/app' : '/login'} />;
}

function Routes() {
  const path = usePath();
  switch (path) {
    case '/':
      return <Home />;
    case '/login':
      return <AuthPage mode="login" />;
    case '/signup':
      return <AuthPage mode="signup" />;
    case '/app':
      return (
        <ProtectedRoute>
          <AppProvider>
            <MainAppContent />
          </AppProvider>
        </ProtectedRoute>
      );
    default:
      return <Redirect to="/" />;
  }
}

export default function App() {
  const path = usePath();
  return (
    <AuthProvider>
      {/* key resets the boundary on navigation, so one crash never traps the user */}
      <ErrorBoundary key={path}>
        <Routes />
      </ErrorBoundary>
    </AuthProvider>
  );
}
