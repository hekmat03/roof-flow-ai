import { useSyncExternalStore } from 'react';

/**
 * What is wrong, in words a contractor can act on, when the AI or the database
 * cannot be reached. The AI client and the data layer report here; the banner and
 * toast read from here. Nothing in this file touches the DOM, so it is safe in tests.
 */
export type AiReason = 'not_configured' | 'unavailable' | 'timeout' | 'network' | 'rate_limited' | 'session';
export type DbReason = 'not_configured' | 'unavailable' | 'network' | 'session';

export interface Notice { title: string; detail: string }

const OFFLINE = 'Replies are simple built-in answers, not live AI.';

export const AI_NOTICES: Record<AiReason, Notice> = {
  not_configured: { title: 'AI is not set up yet', detail: `${OFFLINE} Ask your administrator to add the AI key.` },
  unavailable: { title: 'AI is unavailable right now', detail: `The AI service is not responding. ${OFFLINE} Try again in a minute.` },
  timeout: { title: 'AI took too long to answer', detail: `${OFFLINE} Try again in a minute.` },
  network: { title: 'Cannot reach the server', detail: `Check your internet connection. ${OFFLINE}` },
  rate_limited: { title: 'Too many messages too fast', detail: `Wait a minute, then try again. ${OFFLINE}` },
  session: { title: 'Your session expired', detail: `Log in again to use live AI. ${OFFLINE}` },
};

export const DB_NOTICES: Record<DbReason, Notice> = {
  not_configured: { title: 'Database is not connected', detail: 'Nothing can be saved yet.' },
  unavailable: { title: 'Database is not responding', detail: 'Your latest changes may not be saved. Try again in a minute.' },
  network: { title: 'Cannot reach the database', detail: 'Check your internet connection. Your latest changes may not be saved.' },
  session: { title: 'Your session expired', detail: 'Log in again to load and save your leads.' },
};

/** Why an AI request failed, from what the browser saw. */
export function classifyAiFailure(input: { status?: number; aborted?: boolean; message?: string }): AiReason {
  if (input.aborted) return 'timeout';
  if (input.status === undefined) return 'network';
  if (input.status === 401) return 'session';
  if (input.status === 429) return 'rate_limited';
  if (input.status === 503 && /not configured/i.test(input.message ?? '')) return 'not_configured';
  return 'unavailable';
}

/** Why a database request failed. Accepts Supabase errors, fetch errors and plain Errors. */
export function classifyDbError(error: unknown): DbReason {
  const e = (error ?? {}) as { message?: unknown; status?: unknown; code?: unknown };
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  if (/not configured/.test(message)) return 'not_configured';
  if (status === 401 || status === 403 || /jwt|token.*expired|not authenticated|unauthorized/.test(message)) return 'session';
  if (/failed to fetch|networkerror|network request failed|load failed|offline|fetch failed/.test(message)) return 'network';
  return 'unavailable';
}

export interface ServiceStatus {
  ai: AiReason | null;
  db: DbReason | null;
}

let state: ServiceStatus = { ai: null, db: null };
const listeners = new Set<() => void>();
const update = (next: ServiceStatus) => {
  if (next.ai === state.ai && next.db === state.db) return;
  state = next;
  listeners.forEach((l) => l());
};

export const reportAiFailure = (reason: AiReason) => update({ ...state, ai: reason });
export const reportAiOk = () => update({ ...state, ai: null });
export const reportDbFailure = (reason: DbReason) => update({ ...state, db: reason });
export const reportDbOk = () => update({ ...state, db: null });

export const getServiceStatus = (): ServiceStatus => state;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useServiceStatus = (): ServiceStatus => useSyncExternalStore(subscribe, getServiceStatus, getServiceStatus);
