import React, { useState } from 'react';
import { LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { passwordProblem, passwordScore } from '../lib/passwordRules';
import { navigate } from '../lib/router';
import { StrengthBar } from './auth/AuthShell';

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none';
const btn = 'rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50';
const primary = `${btn} bg-orange-500 text-black hover:bg-orange-400`;
const ghost = `${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`;

type Note = { ok: boolean; text: string } | null;
const Say: React.FC<{ note: Note }> = ({ note }) =>
  note ? <p role="status" className={`text-xs ${note.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{note.text}</p> : null;

/** Password, email and device sessions for the signed-in user. */
export const AccountSecurity: React.FC = () => {
  const { user, configured, updatePassword, updateEmail, signOutEverywhere } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwNote, setPwNote] = useState<Note>(null);
  const [emailNote, setEmailNote] = useState<Note>(null);
  const [devNote, setDevNote] = useState<Note>(null);

  if (!configured || !user) return null;

  const changePassword = async () => {
    const problem = passwordProblem(password);
    if (problem) return setPwNote({ ok: false, text: problem });
    if (password !== confirm) return setPwNote({ ok: false, text: 'The two passwords do not match.' });
    setBusy(true);
    const r = await updatePassword(password);
    setBusy(false);
    if (r.error) return setPwNote({ ok: false, text: r.error });
    setPassword(''); setConfirm('');
    setPwNote({ ok: true, text: 'Password updated. Your other devices were signed out.' });
  };

  const changeEmail = async () => {
    const next = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) return setEmailNote({ ok: false, text: 'Enter a valid email address.' });
    setBusy(true);
    const r = await updateEmail(next);
    setBusy(false);
    if (r.error) return setEmailNote({ ok: false, text: r.error });
    setEmail('');
    setEmailNote({ ok: true, text: `We sent a confirmation link to ${next}. Your email changes after you confirm it.` });
  };

  const signOutAll = async () => {
    setBusy(true);
    const r = await signOutEverywhere();
    if (r.error) { setBusy(false); return setDevNote({ ok: false, text: r.error }); }
    navigate('/login', true);
  };

  const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : null;

  return (
    <section className="glass rounded-xl p-4 space-y-4" aria-label="Account security">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-orange-500" /> Account security
      </h3>
      <p className="text-xs text-slate-400">
        Signed in as {user.email}{lastSignIn ? ` · last sign-in ${lastSignIn}` : ''}
      </p>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-200">Change password</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <input className={input} type="password" autoComplete="new-password" placeholder="New password"
              value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" />
            <StrengthBar score={passwordScore(password)} />
          </div>
          <input className={input} type="password" autoComplete="new-password" placeholder="Confirm new password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm new password" />
        </div>
        <button className={primary} disabled={busy || !password} onClick={changePassword}>Update password</button>
        <Say note={pwNote} />
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Change email</p>
        <div className="flex gap-2">
          <input className={input} type="email" autoComplete="email" placeholder="new@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} aria-label="New email address" />
          <button className={ghost} disabled={busy || !email.trim()} onClick={changeEmail}>Send link</button>
        </div>
        <Say note={emailNote} />
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <p className="text-xs font-semibold text-slate-200">Devices</p>
        <button className={ghost} disabled={busy} onClick={signOutAll}>
          <LogOut className="inline h-3.5 w-3.5 mr-1" />Sign out of all devices
        </button>
        <Say note={devNote} />
      </div>
    </section>
  );
};
