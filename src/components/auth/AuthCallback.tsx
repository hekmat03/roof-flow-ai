import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { navigate } from '../../lib/router';

type VerificationState = 'verifying' | 'success' | 'error';

export const AuthCallback: React.FC = () => {
  const { resendVerification } = useAuth();
  const [state, setState] = useState<VerificationState>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resendEmail, setResendEmail] = useState<string>('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function handleAuthVerification() {
      if (!supabase) {
        if (mounted) {
          setState('error');
          setErrorMessage('Supabase authentication is not configured.');
        }
        return;
      }

      try {
        const hash = window.location.hash.substring(1);
        const search = window.location.search.substring(1);
        const hashParams = new URLSearchParams(hash);
        const searchParams = new URLSearchParams(search);

        const error = hashParams.get('error') || searchParams.get('error');
        const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

        if (error) {
          if (mounted) {
            setState('error');
            setErrorMessage(
              errorDesc
                ? decodeURIComponent(errorDesc.replace(/\+/g, ' '))
                : 'Verification link is invalid or has expired.'
            );
          }
          return;
        }

        const code = searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            if (mounted) {
              setState('error');
              setErrorMessage(exchangeError.message || 'Failed to exchange verification code.');
            }
            return;
          }
        }

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            if (mounted) {
              setState('error');
              setErrorMessage(setSessionError.message || 'Failed to establish verified session.');
            }
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (mounted) {
            setState('success');
            setTimeout(() => {
              navigate('/app', true);
            }, 2000);
          }
        } else {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (newSession?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
              if (mounted) {
                setState('success');
                setTimeout(() => navigate('/app', true), 1500);
              }
            }
          });

          setTimeout(() => {
            subscription.unsubscribe();
            if (mounted) {
              setState(prev => {
                if (prev === 'verifying') {
                  if (!code && !accessToken) {
                    setErrorMessage('No verification tokens found in the request link.');
                    return 'error';
                  }
                  setTimeout(() => navigate('/app', true), 1500);
                  return 'success';
                }
                return prev;
              });
            }
          }, 3000);
        }
      } catch (err) {
        if (mounted) {
          setState('error');
          setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during email verification.');
        }
      }
    }

    void handleAuthVerification();

    return () => {
      mounted = false;
    };
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendBusy(true);
    setResendSuccess(false);
    const res = await resendVerification(resendEmail.trim());
    setResendBusy(false);
    if (!res.error) {
      setResendSuccess(true);
    } else {
      setErrorMessage(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4 text-ink">
      <div className="w-full max-w-md bg-card/90 backdrop-blur-xl border border-line rounded-3xl shadow-2xl shadow-black/60 p-6 sm:p-8 text-center animate-slide-up">
        {state === 'verifying' && (
          <div className="space-y-4 py-6">
            <Loader2 className="h-12 w-12 text-accent-400 animate-spin mx-auto" />
            <h2 className="text-2xl font-bold text-white">Verifying Your Email</h2>
            <p className="text-sm text-slate-400">
              Please wait while we confirm your account credentials with RoofFlow AI...
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="space-y-4 py-4 animate-scaleUp">
            <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-extrabold text-white">Email Verified!</h2>
            <p className="text-sm text-slate-300">
              Your contractor account has been successfully verified. Redirecting you to your RoofFlow AI workspace...
            </p>
            <div className="pt-3">
              <button
                onClick={() => navigate('/app', true)}
                className="btn-accent w-full py-3 flex items-center justify-center gap-2"
              >
                Go to Workspace <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4 text-left">
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 mb-3">
                <XCircle className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-extrabold text-white">Verification Failed</h2>
              <p className="text-sm text-rose-400 mt-1 font-medium">
                {errorMessage || 'This confirmation link has expired or has already been used.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 mt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-accent-400" /> Resend Verification Link
              </h4>
              <p className="text-xs text-slate-400">
                Enter your email address to receive a fresh verification link.
              </p>
              <form onSubmit={handleResend} className="space-y-3">
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={resendEmail}
                    onChange={e => setResendEmail(e.target.value)}
                    className="input-premium pl-9 text-xs w-full"
                  />
                </div>
                {resendSuccess && (
                  <p className="text-xs text-emerald-400 font-semibold">
                    ✓ New verification link sent! Please check your inbox.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={resendBusy || !resendEmail.trim()}
                  className="btn-accent w-full py-2.5 text-xs flex items-center justify-center gap-2"
                >
                  {resendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {resendBusy ? 'Sending...' : 'Send New Link'}
                </button>
              </form>
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={() => navigate('/login', true)}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Return to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
