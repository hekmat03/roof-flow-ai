import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthResult {
  error?: string;
  needsVerification?: boolean;
  unverified?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  emailVerified: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const MIN_PASSWORD_LENGTH = 8;

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Please verify your email first. Check your inbox.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'An account with this email already exists. Try logging in.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password')) return message;
  if (m.includes('fetch') || m.includes('network'))
    return 'Network error. Check your connection and retry.';
  return 'Something went wrong. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (alive) setSession(data.session);
      })
      .catch(() => {
        if (alive) setSession(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback<AuthContextType['signUp']>(async (email, password) => {
    if (!supabase) return { error: 'Authentication is not configured.' };
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });

      if (error) return { error: friendly(error.message) };

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        return { error: 'An account with this email already exists. Try logging in.' };
      }

      return { needsVerification: !data.user?.email_confirmed_at };
    } catch (e) {
      return { error: friendly(e instanceof Error ? e.message : '') };
    }
  }, []);

  const signIn = useCallback<AuthContextType['signIn']>(async (email, password) => {
    if (!supabase) return { error: 'Authentication is not configured.' };
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const unverified = error.message.toLowerCase().includes('email not confirmed');
        return { error: friendly(error.message), unverified };
      }

      return {};
    } catch (e) {
      return { error: friendly(e instanceof Error ? e.message : '') };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const resendVerification = useCallback<AuthContextType['resendVerification']>(async (email) => {
    if (!supabase) return { error: 'Authentication is not configured.' };
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });

      return error ? { error: friendly(error.message) } : {};
    } catch (e) {
      return { error: friendly(e instanceof Error ? e.message : '') };
    }
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const user = session?.user ?? null;
    return {
      user,
      session,
      loading,
      configured: Boolean(supabase),
      emailVerified: Boolean(user?.email_confirmed_at),
      signUp,
      signIn,
      signOut,
      resendVerification,
    };
  }, [session, loading, signUp, signIn, signOut, resendVerification]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
