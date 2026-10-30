import { authHeaders } from './authFetch';

/**
 * Client for /api/billing/*. Every value shown in the billing UI comes from the
 * server (plan, usage, prices); the browser never decides what a user is
 * entitled to. Requests carry the Supabase access token.
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
  /** 'ok' when counters are live. */
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

export interface ApiMessage {
  ok: boolean;
  message?: string;
  paymentsActivated?: boolean;
  url?: string | null;
}

const getJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
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

export const fetchBillingStatus = (): Promise<BillingStatus> => getJson<BillingStatus>('/api/billing/status');

export const startCheckout = (plan: 'starter' | 'pro'): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });

export const openPortal = (): Promise<ApiMessage> =>
  getJson<ApiMessage>('/api/billing/portal', { method: 'POST' });

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
