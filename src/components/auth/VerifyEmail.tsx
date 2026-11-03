import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { navigate } from '../../lib/router';

/** "Check your inbox" screen: shown after signup and for unverified sessions. */
export function VerifyEmail({ email }: { email: string }) {
  const { resendVerification, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy(true);
    setMsg(null);
    const r = await resendVerification(email);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'Verification email sent.' });
    setBusy(false);
  }

  async function back() {
    await signOut();
    navigate('/login', true);
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4 text-ink">
      <div className="w-full max-w-md bg-card border border-line rounded-2xl p-6 sm:p-8 text-center">
        <MailCheck className="h-12 w-12 text-ink mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Verify your email</h1>
        <p className="text-ink-mute text-sm mb-6">
          We sent a confirmation link to <span className="text-ink font-semibold break-all">{email}</span>.
          Click it to activate your account, then log in.
        </p>
        {msg && (
          <p role="alert" className={`text-sm mb-4 ${msg.ok ? 'text-accent-400' : 'text-danger'}`}>{msg.text}</p>
        )}
        <button
          onClick={resend}
          disabled={busy || !email}
          className="w-full bg-gold hover:bg-gold disabled:opacity-60 text-gold-ink font-bold py-3 rounded-xl transition"
        >
          {busy ? 'Sending…' : 'Resend verification email'}
        </button>
        <button onClick={back} className="mt-3 text-sm text-ink-mute hover:text-ink underline">
          Back to login
        </button>
      </div>
    </div>
  );
}
