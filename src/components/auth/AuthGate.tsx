import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Login } from './Login';
import { SignUp } from './SignUp';
import { ForgotPassword } from './ForgotPassword';

type AuthView = 'login' | 'signup' | 'forgot';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  const [view, setView] = useState<AuthView>('login');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (!session) {
    if (view === 'signup') return <SignUp onSwitchToLogin={() => setView('login')} />;
    if (view === 'forgot') return <ForgotPassword onSwitchToLogin={() => setView('login')} />;
    return (
      <Login
        onSwitchToSignUp={() => setView('signup')}
        onSwitchToForgotPassword={() => setView('forgot')}
      />
    );
  }

  return <>{children}</>;
};
