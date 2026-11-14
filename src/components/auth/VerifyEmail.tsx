
import React, { useState, useEffect } from 'react';
import { MailCheck, RefreshCw, ArrowLeft, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { navigate } from '../../lib/router';

/** "Check your inbox" screen: shown after signup and for unverified sessions. */
export function VerifyEmail({ email: initialEmail }: { email?: string }) {
  const { resendVerification, signOut } = useAuth();
  const [email, setEmail] = useState(initialEmail || '');
  const [isEditingEmail, setIsEditingEmail] = useState(!initialEmail);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function resend() {
    if (!email.trim()) {
      setMsg({ ok: false, text: 'Please enter a valid email address.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await resendVerification(email.trim());
    if (r.error) {
      setMsg({ ok: false, text: r.error });
    } else {
      setMsg({ ok: true, text: 'Verification email sent! Please check your inbox or spam folder.' });
      setCooldown(60);
    }
    setBusy(false);
  }

  async function back() {
    await signOut();
    navigate('/login', true);
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4 text-ink">
      <div className="w-full max-w-md bg-card/90 backdrop-blur-xl border border-line rounded-3xl shadow-2xl shadow-black/60 p-6 sm:p-8 text-center animate-slide-up">
        <div className="h-14 w-14 rounded-full bg-accent-500/15 border border-accent-500/30 flex items-center justify-center mx-auto mb-4 text-accent-400 shadow-lg shadow-accent-500/20">
          <MailCheck className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-extrabold text-white mb-2">Check Your Inbox</h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          We sent an account confirmation email to:
        </p>

        {isEditingEmail ? (
          <div className="mb-4 text-left space-y-2">
            <div className="relative">
              <Mail className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-premium pl-9 text-xs w-full"
              />
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-6 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-accent-300 truncate font-mono">{email}</span>
            <button
              onClick={() => setIsEditingEmail(true)}
              className="text-xs text-slate-400 hover:text-white underline shrink-0"
            >
              Change
            </button>
          </div>
        )}

        {msg && (
          <div role="alert" className={`p-3 rounded-xl mb-4 text-xs font-medium border ${
            msg.ok
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            {msg.text}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={resend}
            disabled={busy || !email.trim() || cooldown > 0}
            className="btn-accent w-full py-3 text-xs flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
          </button>

          <button
            onClick={back}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
