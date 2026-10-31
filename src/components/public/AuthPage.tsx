import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck, Workflow } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './public.css';

type AuthMode = 'login' | 'signup' | 'verify-email';

const getMode = (): AuthMode => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/signup') return 'signup';
  if (path === '/verify-email') return 'verify-email';
  return 'login';
};

const Brand = () => (
  <a className="rf-brand" href="/" aria-label="RoofFlow AI home">
    <span className="rf-brand-mark"><Workflow size={19} strokeWidth={2.3} /></span>
    <span className="rf-brand-name">RoofFlow <span>AI</span></span>
  </a>
);

export const AuthPage: React.FC = () => {
  const mode = getMode();
  const { user, loading, configured, isEmailVerified, signUp, signIn, resendVerification } = useAuth();
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get('email') ?? user?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
        setSignupComplete(true);
        setNotice('Your account has been created. Verify your email before continuing to your workspace.');
      } else {
        await signIn(email.trim(), password);
        window.location.assign('/app');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'We could not complete your request. Please try again.';
      if (/email.+(not confirmed|not verified)|confirm.+email/i.test(message) && mode === 'login') {
        window.location.assign(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resendVerification(email.trim());
      setNotice(`A new verification email has been sent to ${email.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not resend the verification email. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyScreen = mode === 'verify-email' || signupComplete || (Boolean(user) && !isEmailVerified);
  const currentEmail = email || user?.email || '';

  if (loading) {
    return (
      <main className="rf-public rf-auth-shell" aria-label="Loading account">
        <aside className="rf-auth-aside"><Brand /><div className="rf-auth-aside-foot">ROOFFLOW AI · CONTRACTOR WORKSPACE</div></aside>
        <section className="rf-auth-main"><div className="rf-auth-card rf-auth-loading" aria-label="Loading account details"><div className="rf-skeleton" style={{ width: '38%' }} /><div className="rf-skeleton" style={{ width: '72%', height: 30 }} /><div className="rf-skeleton" style={{ width: '100%', height: 48 }} /><div className="rf-skeleton" style={{ width: '100%', height: 48 }} /></div></section>
      </main>
    );
  }

  return (
    <main className="rf-public rf-auth-shell">
      <aside className="rf-auth-aside">
        <Brand />
        <div className="rf-auth-aside-content">
          <span className="rf-kicker">A clearer way to keep up</span>
          <h1>Good leads deserve a <span>good reply.</span></h1>
          <p>RoofFlow AI gives small roofing teams a reliable place to answer inquiries, qualify leads, manage the CRM, and request inspections.</p>
          <div className="rf-auth-points">
            <div className="rf-auth-point"><Check size={16} /> Respond to homeowner inquiries</div>
            <div className="rf-auth-point"><Check size={16} /> Keep qualified leads organized</div>
            <div className="rf-auth-point"><Check size={16} /> Move toward an inspection request</div>
          </div>
        </div>
        <div className="rf-auth-aside-foot">ROOFFLOW AI · CONTRACTOR WORKSPACE</div>
      </aside>

      <section className="rf-auth-main">
        <div className="rf-auth-card">
          <div className="rf-auth-mobile-brand"><Brand /></div>
          {verifyScreen ? (
            <>
              <div className="rf-verify-icon"><Mail size={25} /></div>
              <span className="rf-kicker">One quick step</span>
              <h2 style={{ marginTop: 14 }}>{mode === 'verify-email' || signupComplete ? 'Verify your email' : 'Email verification required'}</h2>
              <p className="rf-auth-intro">We require a verified email before you can access your RoofFlow workspace. Check your inbox for the verification link{currentEmail ? <> sent to <strong style={{ color: '#e7ebf0' }}>{currentEmail}</strong></> : ''}.</p>
              {error && <div className="rf-auth-error" role="alert">{error}</div>}
              {notice && <div className="rf-auth-success" role="status">{notice}</div>}
              {!configured && <div className="rf-auth-error" role="status">Account services are not configured yet. Please try again later.</div>}
              <div className="rf-verify-actions">
                <button className="rf-button" type="button" disabled={busy || !configured || !currentEmail} onClick={() => void handleResend()}>
                  {busy ? 'Sending…' : 'Resend verification email'} <ArrowRight size={15} />
                </button>
                <a className="rf-button rf-button-quiet" href="/login"><ArrowLeft size={15} /> Return to log in</a>
              </div>
              <p className="rf-verify-help">If the message is not in your inbox, check your spam folder. The verification link is required before workspace access.</p>
            </>
          ) : (
            <>
              <span className="rf-kicker">{mode === 'signup' ? 'Start with Free' : 'Welcome back'}</span>
              <h2 style={{ marginTop: 14 }}>{mode === 'signup' ? 'Create your account' : 'Log in to RoofFlow'}</h2>
              <p className="rf-auth-intro">{mode === 'signup' ? 'A more dependable way to handle your next roofing lead starts here.' : 'Pick up where your team left off.'}</p>
              {error && <div className="rf-auth-error" role="alert">{error}</div>}
              {!configured && <div className="rf-auth-error" role="status">Account services are not configured yet. Please try again later.</div>}
              <form className="rf-auth-form" onSubmit={(event) => void handleSubmit(event)}>
                <div className="rf-field">
                  <label htmlFor="roof-email">Email address</label>
                  <input id="roof-email" type="email" autoComplete="email" placeholder="you@yourcompany.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="rf-field">
                  <label htmlFor="roof-password">Password</label>
                  <input id="roof-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Enter your password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} />
                  {mode === 'signup' && <span className="rf-password-note">Use at least 6 characters.</span>}
                </div>
                <button className="rf-button rf-auth-submit" type="submit" disabled={busy || !configured}>
                  {busy ? 'Please wait…' : mode === 'signup' ? 'Create Free Account' : 'Log in'} {!busy && <ArrowRight size={15} />}
                </button>
              </form>
              <p className="rf-auth-switch">
                {mode === 'signup' ? <>Already have an account? <a href="/login">Log in</a></> : <>New to RoofFlow? <a href="/signup">Create a free account</a></>}
              </p>
              <p className="rf-auth-switch" style={{ marginTop: 15 }}><a href="/" style={{ marginLeft: 0 }}><ArrowLeft size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} /> Back to RoofFlow</a></p>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default AuthPage;
