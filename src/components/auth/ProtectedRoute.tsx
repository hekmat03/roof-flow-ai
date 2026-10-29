import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FullScreenSpinner } from '../Spinner';
import { Redirect } from '../Redirect';
import { VerifyEmail } from './VerifyEmail';

/** Renders children only for a signed-in, email-verified user. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, configured, emailVerified } = useAuth();

  if (!configured) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 text-center text-slate-100">
        <div className="max-w-md">
          <h2 className="text-xl font-bold mb-2">Authentication is not configured</h2>
          <p className="text-slate-400 text-sm">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.
          </p>
        </div>
      </div>
    );
  }
  if (loading) return <FullScreenSpinner label="Checking your session…" />;
  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return <Redirect to={`/login?next=${next}`} />;
  }
  if (!emailVerified) return <VerifyEmail email={user.email ?? ''} />;
  return <>{children}</>;
}
