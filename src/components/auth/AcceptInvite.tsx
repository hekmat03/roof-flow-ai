import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { acceptInvite, clearPendingInvite, pendingInvite, rememberInvite } from '../../lib/teamApi';
import { navigate } from '../../lib/router';
import { FullScreenSpinner } from '../Spinner';

/**
 * /invite?token=...  Joins the signed-in, email-verified user to the inviting
 * workspace. Visitors who are not signed in are sent to log in / sign up first and
 * the token is remembered so the invite still completes after email verification.
 */
export function AcceptInvite() {
  const { user, loading, emailVerified } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const token = new URLSearchParams(window.location.search).get('token') || pendingInvite();

  useEffect(() => {
    if (loading) return;
    if (!token) { setError('This invitation link is incomplete.'); return; }
    if (!user || !emailVerified) {
      rememberInvite(token);
      navigate(`/${user ? 'verify-email' : 'signup'}?next=${encodeURIComponent('/invite')}`, true);
      return;
    }
    let cancelled = false;
    void acceptInvite(token).then((result) => {
      if (cancelled) return;
      if (result.ok === false) { clearPendingInvite(); setError(result.error); return; }
      clearPendingInvite();
      // Full reload so the app picks up the new workspace and role everywhere.
      window.location.assign('/app');
    });
    return () => { cancelled = true; };
  }, [loading, user, emailVerified, token]);

  if (!error) return <FullScreenSpinner label="Joining your team…" />;
  return (
    <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
      <div className="glass rounded-xl p-6 max-w-md w-full text-center space-y-4">
        <h1 className="text-lg font-bold text-white">Couldn’t join the team</h1>
        <p className="text-sm text-slate-300">{error}</p>
        <button
          onClick={() => navigate('/app')}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
        >
          Go to the app
        </button>
      </div>
    </div>
  );
}
