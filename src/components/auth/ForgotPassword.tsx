import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { navigate } from '../../lib/router';
import { AuthShell, authInput } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** /forgot-password — emails a reset link. Always answers the same way, so it never reveals who has an account. */
export function ForgotPassword() {
  const { requestPasswordReset, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const address = email.trim();
    if (!EMAIL_RE.test(address)) return setError('Enter a valid email address.');
    setBusy(true);
    const r = await requestPasswordReset(address);
    setBusy(false);
    if (r.error) return setError(r.error);
    setSentTo(address);
    setCooldown(60);
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox">
        <div className="h-14 w-14 rounded-full bg-accent-500/15 border border-accent-500/30 flex items-center justify-center text-accent-400">
          <MailCheck className="h-7 w-7" />
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">
          If an account exists for <strong className="text-ink">{sentTo}</strong>, we sent a link to reset your password.
          It expires soon, so use it right away. Check your spam folder too.
        </p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="button" onClick={() => void send()} disabled={busy || cooldown > 0}
          className="btn-accent w-full py-3 disabled:opacity-50">
          {busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
        </button>
        <button type="button" onClick={() => navigate('/login')} className="w-full text-sm text-ink-mute hover:text-ink min-h-0">
          Back to login
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send you a reset link.">
      <form onSubmit={send} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-ink-soft mb-1.5">Email</label>
          <input id="email" type="email" autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={authInput} placeholder="you@company.com" />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy || !configured}
          className="btn-accent w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3.5">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
        <button type="button" onClick={() => navigate('/login')} className="w-full text-sm text-ink-mute hover:text-ink min-h-0">
          Back to login
        </button>
      </form>
    </AuthShell>
  );
}
