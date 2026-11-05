import { useState, type FormEvent } from 'react';
import { ArrowRight, CloudLightning, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, useAuth } from '../../context/AuthContext';
import { navigate, safeNext } from '../../lib/router';
import { Redirect } from '../Redirect';
import { FullScreenSpinner } from '../Spinner';
import { VerifyEmail } from './VerifyEmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, loading, configured, emailVerified, signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
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
    try {
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
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full bg-inset border border-line focus:border-gold/60 focus:ring-4 focus:ring-gold/10 outline-none rounded-xl px-4 py-3 text-ink placeholder-ink-mute transition';

  return (
    <div className="relative min-h-screen bg-page flex items-center justify-center p-4 text-ink overflow-hidden">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gold/20 blur-[110px]" />
      <div className="relative w-full max-w-md animate-slide-up">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-3 mx-auto mb-7"
          aria-label="RoofFlow AI home"
        >
          <span className="bg-gradient-to-br from-accent-300 to-accent-500 p-2.5 rounded-xl shadow-lg shadow-gold/30">
            <CloudLightning className="h-6 w-6 text-gold-ink stroke-[2.5]" />
          </span>
          <span className="text-2xl font-black tracking-tight">
            Roof<span className="text-accent-400">Flow</span> AI
          </span>
        </button>

        <form
          onSubmit={onSubmit}
          noValidate
          className="bg-card/80 backdrop-blur-xl border border-line rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl shadow-black/60"
        >
          <h1 className="text-3xl font-extrabold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-sm text-ink-mute">
            {isSignup ? 'Start free. No credit card required.' : 'Log in to your contractor dashboard.'}
          </p>

          {!configured && (
            <div role="status" className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm text-ink-soft">
              <div className="flex items-center gap-2 font-semibold text-gold">
                <ShieldAlert className="h-4 w-4" /> Accounts aren't connected yet
              </div>
              <p className="mt-1.5">
                This site was built without Supabase keys, so sign-up and login can't work. You can still explore the
                workspace in demo mode (data stays in this browser).
              </p>
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 font-bold text-gold-ink min-h-0"
              >
                Open demo workspace <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-ink-soft mb-1.5">Email</label>
            <input id="email" type="email" autoComplete="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@company.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-ink-soft mb-1.5">Password</label>
            <div className="relative">
              <input id="password" type={showPw ? 'text' : 'password'} value={password}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                onChange={(e) => setPassword(e.target.value)} className={`${input} pr-12`}
                placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'} />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center text-ink-mute hover:text-ink min-h-0">
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={busy || !configured}
            className="btn-accent w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed py-3.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Please wait…' : isSignup ? 'Start Free – No Credit Card' : 'Log in'}
          </button>

          <p className="text-sm text-ink-mute text-center">
            {isSignup ? 'Already have an account? ' : 'New here? '}
            <button type="button" className="text-ink hover:text-gold font-semibold min-h-0"
              onClick={() => navigate(isSignup ? '/login' : '/signup')}>
              {isSignup ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
