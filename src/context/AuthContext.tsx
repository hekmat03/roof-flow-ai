import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  isEmailVerified: boolean;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  completeAuthCallback: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const emailRedirectTo = () => `${window.location.origin}/auth/callback`;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setLoading(false);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) console.error('Could not restore the Supabase session:', error.message);
        setSession(data.session);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        console.error('Could not restore the Supabase session:', error);
        setLoading(false);
      });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured yet. Add the public Supabase URL and anon key.');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) throw error;
    setSession(data.session);
    return Boolean(data.user && !data.session);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured yet. Add the public Supabase URL and anon key.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    setSession(data.session);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured yet.');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) throw error;
  }, []);

  const completeAuthCallback = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured yet.');
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      setSession(data.session);
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      const message = url.searchParams.get('error_description') || 'The verification link is invalid or has expired.';
      throw new Error(message);
    }
    setSession(data.session);
  }, []);

  const user = session?.user ?? null;
  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    configured: supabaseConfigured,
    isEmailVerified: Boolean(user?.email_confirmed_at || user?.confirmed_at),
    signUp,
    signIn,
    signOut,
    resendVerification,
    completeAuthCallback,
  }), [user, session, loading, signUp, signIn, signOut, resendVerification, completeAuthCallback]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
};
