
import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AppShellSkeleton } from '../Skeleton';
import { Redirect } from '../Redirect';
import { VerifyEmail } from './VerifyEmail';

/** Renders children only for a signed-in, email-verified user. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, configured, emailVerified } = useAuth();

  // No Supabase project configured (the published demo build has no anon key):
  // fall through to the local-only app instead of a dead end. All state lives in
  // localStorage, so the simulators/CRM still work end to end for demos.
  if (!configured) return <>{children}</>;
  if (loading) return <AppShellSkeleton />;
  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return <Redirect to={`/login?next=${next}`} />;
  }
  if (!emailVerified) return <VerifyEmail email={user.email ?? ''} />;
  return <>{children}</>;
}
