import { useState, type FormEvent } from 'react';
import { CloudLightning, Loader2 } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, useAuth } from '../../context/AuthContext';
import { navigate, safeNext } from '../../lib/router';
import { Redirect } from '../Redirect';
import { FullScreenSpinner } from '../Spinner';
import { VerifyEmail } from './VerifyEmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, loading, emailVerified, signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const next = safeNext(new URLSearchParams(window.location.search).get('next'));
  const isSignup = mode === 'signup';

  if (loading) return <FullScreenSpinner />;
  if (user && emailVerified) return <Redirect to={next} />;
  if (pendingEmail) return <VerifyEmail email={pendingEmail} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (isSignup && password.length < MIN_PASSWORD_LENGTH)
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (!password) return setError('Enter your password.');

    setBusy(true);
    if (isSignup) {
      const r = await signUp(email, password);
      if (r.error) setError(r.error);
      else if (r.needsVerification) setPendingEmail(email.trim());
      else navigate(next, true);
    } else {
      const r = await signIn(email, password);
      if (r.unverified) setPendingEmail(email.trim());
      else if (r.error) setError(r.error);
      else navigate(next, true);
    }
    setBusy(false);
  }

  const input =
    'w-full bg-page border border-line focus:border-line outline-none rounded-xl px-4 py-3 text-ink placeholder-ink-mute';

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4 text-ink">
      <div className="w-full max-w-md">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 mx-auto mb-6" aria-label="RoofFlow AI home">
          <span className="bg-gold p-2 rounded-xl"><CloudLightning className="h-6 w-6 text-gold-ink" /></span>
          <span className="text-xl font-black">Roof<span className="text-ink">Flow</span> AI</span>
        </button>

        <form onSubmit={onSubmit} noValidate className="bg-card border border-line rounded-2xl p-6 sm:p-8 space-y-4">
          <h1 className="text-2xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-sm text-ink-mute">
            {isSignup ? 'Start free. No credit card required.' : 'Log in to your contractor dashboard.'}
          </p>

          <div>
            <label htmlFor="email" className="block text-sm text-ink-soft mb-1">Email</label>
            <input id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@company.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-ink-soft mb-1">Password</label>
            <input id="password" type="password" value={password}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)} className={input}
              placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'} />
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-gold hover:bg-gold disabled:opacity-60 text-gold-ink font-bold py-3 rounded-xl transition">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Please wait…' : isSignup ? 'Start Free - No Credit Card' : 'Log in'}
          </button>

          <p className="text-sm text-ink-mute text-center">
            {isSignup ? 'Already have an account? ' : 'New here? '}
            <button type="button" className="text-ink hover:underline font-semibold"
              onClick={() => navigate(isSignup ? '/login' : '/signup')}>
              {isSignup ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
