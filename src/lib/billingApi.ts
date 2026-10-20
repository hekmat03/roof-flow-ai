import { useCallback, useEffect, useState } from 'react';

/**
 * Client for the site's billing/account API (same origin, so cookies flow).
 *
 * HONESTY CONTRACT: every value rendered in the billing UI comes from the server
 * — plan, usage and activation state are never inferred in the browser. When the
 * API cannot be reached the UI shows an explicit "could not reach billing"
 * state rather than an invented price, quota or renewal date.
 */

export interface PlanView {
  id: 'free' | 'starter' | 'pro';
  name: string;
  priceMonthlyUsd: number;
  conversationsPerMonth: number;
  tagline: string;
  includes: string[];
  capabilities: Record<string, unknown>;
  priceIdConfigured: boolean;
}

export interface UsageView {
  used: number;
  limit: number;
  remaining?: number;
  periodStart: string;
  periodEnd: string;
  /** `ok` when counters are live; `table_missing` / `not_configured` otherwise. */
  storage: string;
}

export interface SubscriptionView {
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  hasPrice: boolean;
}

export interface BillingStatus {
  paymentsActivated: boolean;
  authenticated: boolean;
  user: { id: string; email: string } | null;
  plan: 'free' | 'starter' | 'pro';
  subscription: SubscriptionView | null;
  usage: UsageView | null;
  plans: PlanView[];
  notIncluded: string[];
}

export interface SessionView {
  authenticated: boolean;
  user: { id: string; email: string } | null;
  plan?: string;
  usage?: UsageView;
}

export type LoadState<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'error'; message: string };

const getJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok && !body) throw new Error(`HTTP ${String(res.status)}`);
  return body as T;
};

/**
 * Billing status for the signed-in user (or the catalogue when signed out).
 * This is the only endpoint the billing UI reads the catalogue from, so prices
 * and limits can never drift from the server's copy.
 */
export const fetchBillingStatus = (): Promise<BillingStatus> => getJson<BillingStatus>('/api/billing/status');

export const fetchSession = (): Promise<SessionView> => getJson<SessionView>('/api/auth/session');

export interface ApiMessage {
  ok: boolean;
  error?: string;
  message?: string;
  signedIn?: boolean;
  needsConfirmation?: boolean;
  paymentsActivated?: boolean;
  url?: string | null;
}

export const signIn = (email: string, password: string): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const signUp = (email: string, password: string): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });

export const signOut = (): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/auth/session', { method: 'POST' });

export const startCheckout = (plan: 'starter' | 'pro'): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });

export const openPortal = (): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/billing/portal', { method: 'POST' });

/** Loads the billing status once, with a manual `reload` for after sign-in/out. */
export const useBillingStatus = (): {
  result: LoadState<BillingStatus>;
  reload: () => void;
} => {
  const [result, setResult] = useState<LoadState<BillingStatus>>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    setResult({ state: 'loading' });
    void fetchBillingStatus()
      .then((data) => {
        if (alive) setResult({ state: 'ready', data });
      })
      .catch(() => {
        if (alive) {
          setResult({
            state: 'error',
            message: 'Could not reach the billing service. Plan and usage figures are unavailable right now.',
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [nonce]);
  return { result, reload };
};

/* -------------------------------------------------------------------------- */
/* Display helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Renewal/period dates are only shown when payments are actually activated.
 * Before that there is no subscription, so the UI prints an em dash instead of
 * inventing a date.
 */
export const formatPeriod = (iso: string | null | undefined, paymentsActivated: boolean): string => {
  if (!paymentsActivated || !iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatMonth = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' });
};
