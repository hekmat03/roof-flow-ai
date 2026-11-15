import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { passwordProblem, passwordScore } from '../../lib/passwordRules';
import { navigate } from '../../lib/router';
import { AuthShell, StrengthBar, authInput } from './AuthShell';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

/** /reset-password — the page the emailed link opens. Needs the recovery session that link creates. */
export function ResetPassword() {
  const { updatePassword } = useAuth();
  const [phase, setPhase] = useState<Phase>('checking');
  const [reason, setReason] = useState('This reset link is invalid or has expired.');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setPhase('invalid'); setReason('Authentication is not configured.'); return; }
    const client = supabase;
    let alive = true;
    const ready = () => {
      if (!alive) return;
      setPhase((p) => (p === 'checking' ? 'ready' : p));
      // Tokens are single-use secrets: take them out of the address bar.
      window.history.replaceState(null, '', '/reset-password');
    };

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    const urlError = hash.get('error_description') || search.get('error_description');
    if (hash.get('error') || search.get('error')) {
      setPhase('invalid');
      if (urlError) setReason(urlError.replace(/\+/g, ' '));
      return;
    }

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) ready();
    });

    const code = search.get('code');
    if (code) {
      void client.auth.exchangeCodeForSession(code).then(({ error: e }) => {
        if (!alive) return;
        if (e) setPhase('invalid'); else ready();
      });
    } else {
      void client.auth.getSession().then(({ data }) => { if (data.session) ready(); });
    }

    // If nothing established a session, the link was bad, expired or already used.
    const timer = window.setTimeout(() => {
      void client.auth.getSession().then(({ data }) => {
        if (!alive) return;
        if (data.session) ready(); else setPhase((p) => (p === 'checking' ? 'invalid' : p));
      });
    }, 4000);

    return () => { alive = false; window.clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const r = await updatePassword(password);
    setBusy(false);
    if (r.error) return setError(r.error);
    setPhase('done');
    window.setTimeout(() => navigate('/app', true), 2000);
  }

  if (phase === 'checking') {
    return (
      <AuthShell title="Checking your link…">
        <Loader2 className="h-10 w-10 text-accent-400 animate-spin" />
      </AuthShell>
    );
  }

  if (phase === 'invalid') {
    return (
      <AuthShell title="Link not valid">
        <div className="h-14 w-14 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <XCircle className="h-8 w-8" />
        </div>
        <p className="text-sm text-ink-soft">{reason} Request a new one and try again.</p>
        <button type="button" onClick={() => navigate('/forgot-password')} className="btn-accent w-full py-3">
          Request a new link
        </button>
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell title="Password updated">
        <div className="h-14 w-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <p className="text-sm text-ink-soft">Your password was changed and your other devices were signed out. Taking you to your workspace…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters with a letter and a number.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="new-password" className="block text-sm text-ink-soft mb-1.5">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={authInput} />
          <StrengthBar score={passwordScore(password)} />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm text-ink-soft mb-1.5">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={authInput} />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy}
          className="btn-accent w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3.5">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}
