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
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center">
        <MailCheck className="h-12 w-12 text-[#F97316] mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Verify your email</h1>
        <p className="text-slate-400 text-sm mb-6">
          We sent a confirmation link to <span className="text-slate-200 font-semibold break-all">{email}</span>.
          Click it to activate your account, then log in.
        </p>
        {msg && (
          <p role="alert" className={`text-sm mb-4 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
        )}
        <button
          onClick={resend}
          disabled={busy || !email}
          className="w-full bg-[#F97316] hover:bg-orange-400 disabled:opacity-60 text-slate-950 font-bold py-3 rounded-xl transition"
        >
          {busy ? 'Sending…' : 'Resend verification email'}
        </button>
        <button onClick={back} className="mt-3 text-sm text-slate-400 hover:text-white underline">
          Back to login
        </button>
      </div>
    </div>
  );
}
