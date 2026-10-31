import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Agent1Chatbot } from './components/Agent1Chatbot';
import { CRMLeadsBoard } from './components/CRMLeadsBoard';
import { AuthPage } from './components/public/AuthPage';
import { LandingPage } from './components/public/LandingPage';
import { supabase } from './lib/supabase';

const getPath = () => window.location.pathname.replace(/\/+$/, '') || '/';

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="route-loading" role="status" aria-live="polite">
      <span className="route-loading__mark" aria-hidden="true" />
      <p>{label}</p>
    </main>
  );
}

function MainAppContent() {
  const { activeTab, setActiveTab } = useApp();

  useEffect(() => {
    const syncTabFromPath = () => setActiveTab(getPath() === '/app/crm' ? 'crm' : 'agent1');
    window.addEventListener('popstate', syncTabFromPath);
    return () => window.removeEventListener('popstate', syncTabFromPath);
  }, [setActiveTab]);

  return (
    <Layout>
      <div key={activeTab} className="animate-tab-in">
        {activeTab === 'crm' ? <CRMLeadsBoard /> : <Agent1Chatbot />}
      </div>
    </Layout>
  );
}

function WorkspaceRoute() {
  const { loading, user, isEmailVerified } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace('/login');
    } else if (!isEmailVerified) {
      window.location.replace(`/verify-email?email=${encodeURIComponent(user.email ?? '')}`);
    }
  }, [loading, user, isEmailVerified]);

  if (loading || !user || !isEmailVerified) return <LoadingScreen label="Opening your secure workspace…" />;
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}

function AuthCallbackRoute() {
  const { completeAuthCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await completeAuthCallback();
        const { data, error: sessionError } = await supabase!.auth.getSession();
        if (sessionError) throw sessionError;
        const user = data.session?.user;
        if (!user) throw new Error('The verification link could not create a session. Request a new link and try again.');
        if (!user.email_confirmed_at && !user.confirmed_at) {
          window.location.replace(`/verify-email?email=${encodeURIComponent(user.email ?? '')}`);
          return;
        }
        window.location.replace('/app');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'The verification link could not be completed.');
      }
    })();
    return () => { active = false; };
  }, [completeAuthCallback]);

  return error ? (
    <main className="route-error">
      <div className="route-error__card">
        <span className="rf-kicker">Account verification</span>
        <h1>We couldn’t verify that link.</h1>
        <p role="alert">{error}</p>
        <a className="rf-button" href="/login">Return to log in</a>
      </div>
    </main>
  ) : <LoadingScreen label="Verifying your email…" />;
}

function AuthRoute() {
  const { loading, user, isEmailVerified } = useAuth();

  useEffect(() => {
    if (!loading && user && isEmailVerified) {
      window.location.replace('/app');
    }
  }, [loading, user, isEmailVerified]);

  if (loading) return <LoadingScreen label="Loading account…" />;
  return <AuthPage />;
}

function NotFoundRoute() {
  return (
    <main className="route-error">
      <div className="route-error__card">
        <span className="rf-kicker">RoofFlow AI</span>
        <h1>Page not found</h1>
        <p>The page you requested isn’t available.</p>
        <a className="rf-button" href="/">Return to home</a>
      </div>
    </main>
  );
}

export default function App() {
  const [path, setPath] = useState(getPath);

  useEffect(() => {
    const updatePath = () => setPath(getPath());
    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);

  if (path === '/') return <LandingPage />;
  if (path === '/auth/callback') return <AuthCallbackRoute />;
  if (path === '/login' || path === '/signup' || path === '/verify-email') return <AuthRoute />;
  if (path === '/app' || path === '/app/chatbot' || path === '/app/crm') return <WorkspaceRoute />;
  return <NotFoundRoute />;
}
