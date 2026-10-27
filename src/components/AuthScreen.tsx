import React, { useState } from 'react';
import { CloudLightning, Mail } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { navigate } from '../lib/navigate';
import { BusyButton } from './BusyButton';

export const AuthScreen: React.FC<{ mode: 'login' | 'signup' }> = ({ mode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const isSignup = mode === 'signup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (!supabase) {
        setNotice('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        return;
      }
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) {
          setNotice(error.message);
          return;
        }
        if (data.session) {
          navigate('/app');
          return;
        }
        setNeedsVerify(true);
        setNotice('Check your inbox to verify your email, then sign in.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setNotice(error.message);
          return;
        }
        const confirmed = Boolean(data.user?.email_confirmed_at);
        if (!confirmed) {
          await supabase.auth.signOut();
          setNeedsVerify(true);
          setNotice('Please verify your email before opening the dashboard.');
          return;
        }
        navigate('/app');
      }
    } catch {
      setNotice('Could not reach the account service.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md glass rounded-3xl p-6 md:p-8">
        <button type="button" className="flex items-center gap-2 mb-6" onClick={() => navigate('/')}>
          <div className="bg-gradient-to-br from-accent-400 to-accent-600 p-2 rounded-xl">
            <CloudLightning className="h-5 w-5 text-slate-950" />
          </div>
          <span className="font-black text-white">Roof<span className="text-accent-400">Flow</span> AI</span>
        </button>
        <h1 className="text-2xl font-black text-white">{isSignup ? 'Create your free account' : 'Welcome back'}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {isSignup ? 'No credit card required. Verify your email to open the dashboard.' : 'Sign in with the email you registered.'}
        </p>
        {!supabaseConfigured && (
          <p className="mt-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            Auth is not connected yet. Set the Supabase URL and anon key in the environment.
          </p>
        )}
        {needsVerify && (
          <p className="mt-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex gap-2">
            <Mail className="h-4 w-4 shrink-0 mt-0.5" />
            Use the verification link from Supabase Auth, then return here to sign in.
          </p>
        )}
        <form className="mt-6 space-y-3" onSubmit={(e) => void submit(e)}>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-900/80 border border-slate-700 px-3 py-2.5 text-slate-100 outline-none focus:border-accent-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-900/80 border border-slate-700 px-3 py-2.5 text-slate-100 outline-none focus:border-accent-500"
            />
          </label>
          {notice && <p className="text-sm text-slate-200 bg-slate-900/70 border border-slate-700 rounded-xl p-3">{notice}</p>}
          <BusyButton busy={busy} type="submit" className="btn-accent w-full px-4 py-3 text-sm">
            {isSignup ? 'Start For Free' : 'Sign in'}
          </BusyButton>
        </form>
        <p className="text-sm text-slate-400 mt-5">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="text-accent-400 font-semibold min-h-0"
            onClick={() => navigate(isSignup ? '/login' : '/signup')}
          >
            {isSignup ? 'Sign in' : 'Create a free account'}
          </button>
        </p>
      </div>
    </div>
  );
};
