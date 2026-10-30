import { useSyncExternalStore } from 'react';

/**
 * Tiny dependency-free path router (History API).
 * Paths: /  /login  /signup  /app
 * Needs the SPA rewrite in vercel.json so deep links resolve to index.html.
 */
const EVENT = 'roofflow:navigate';

export function navigate(to: string, replace = false): void {
  if (to === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** Current pathname, normalised (no trailing slash except root). */
export function usePath(): string {
  const raw = useSyncExternalStore(subscribe, () => window.location.pathname, () => '/');
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
}

/** Safe in-app redirect target (blocks open redirects like //evil.com). */
export function safeNext(value: string | null, fallback = '/app'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
