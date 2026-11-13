// api/_lib/leadGuards.ts — abuse guards for the PUBLIC lead endpoint (POST /api/leads).
// Pure functions with injected dependencies (limiter, fetch) so they can be tested offline.
// The widget_key is public (it ships in widget.js), so the per-IP limit alone cannot stop a
// flood aimed at one contractor. These guards add: a per-widget-key cap, a Cloudflare
// Turnstile check, duplicate detection and a request-size cap.

export const MAX_LEAD_BODY_BYTES = 16 * 1024;
export const WIDGET_KEY_PER_HOUR = 30;
export const WIDGET_KEY_PER_DAY = 200;
/** Duplicates are looked up among a tenant's leads from the last 24 hours. */
export const DUPLICATE_WINDOW_HOURS = 24;

const WIDGET_KEY_RE = /^wk_[a-f0-9]{32}$/;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;

export type GuardResult = { ok: true } | { ok: false; status: number; code: string; message: string };
const deny = (status: number, code: string, message: string): GuardResult => ({ ok: false, status, code, message });

/** True when the declared Content-Length, or the serialised body itself, exceeds `max` bytes. Fails closed. */
export function bodyTooLarge(
  body: unknown,
  contentLength?: string | string[] | undefined,
  max: number = MAX_LEAD_BODY_BYTES,
): boolean {
  const header = Array.isArray(contentLength) ? contentLength[0] : contentLength;
  const declared = header !== undefined && /^\d+$/.test(header.trim()) ? Number(header.trim()) : 0;
  if (declared > max) return true;
  try {
    const text = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    return new TextEncoder().encode(text).length > max;
  } catch {
    return true;
  }
}

/** The widget key from the request body, or null when it is missing or malformed. */
export function widgetKeyFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const key = (body as Record<string, unknown>).widget_key;
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  return WIDGET_KEY_RE.test(trimmed) ? trimmed : null;
}

export interface Limiter {
  /** Returns true when the call is within the limit (and counts it). */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

/** Hourly and daily caps per widget key, so rotating IPs cannot flood one contractor's CRM. */
export async function checkWidgetKeyLimits(widgetKey: string, limiter: Limiter): Promise<GuardResult> {
  try {
    if (!(await limiter.allow(`widget-key-hour:${widgetKey}`, WIDGET_KEY_PER_HOUR, 3600))) {
      return deny(429, 'widget_rate_limited', 'This form is receiving too many requests right now. Please try again later.');
    }
    if (!(await limiter.allow(`widget-key-day:${widgetKey}`, WIDGET_KEY_PER_DAY, 86400))) {
      return deny(429, 'widget_daily_limit', 'This form has reached its daily limit. Please try again tomorrow.');
    }
    return { ok: true };
  } catch {
    return deny(503, 'rate_limit_unavailable', 'We could not process that request. Please try again.');
  }
}

export interface TurnstileOptions {
  /** TURNSTILE_SECRET_KEY. When unset the check is skipped (with a warning), never a crash. */
  secret: string | undefined;
  token: unknown;
  remoteIp?: string;
  fetchFn?: typeof fetch;
  warn?: (message: string) => void;
  timeoutMs?: number;
}

let warnedUnconfigured = false;
export function resetTurnstileWarning(): void { warnedUnconfigured = false; }

/** Server-side Cloudflare Turnstile verification. Fails closed once a secret is configured. */
export async function verifyTurnstile(o: TurnstileOptions): Promise<GuardResult> {
  const secret = o.secret?.trim();
  if (!secret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      (o.warn ?? console.warn)('TURNSTILE_SECRET_KEY is not set: bot check skipped for POST /api/leads.');
    }
    return { ok: true };
  }
  if (typeof o.token !== 'string' || o.token.trim() === '' || o.token.length > MAX_TOKEN_LENGTH) {
    return deny(400, 'turnstile_required', 'Please complete the verification and try again.');
  }
  const doFetch = o.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 4000);
  try {
    const form = new URLSearchParams({ secret, response: o.token.trim() });
    if (o.remoteIp && o.remoteIp !== 'unknown') form.set('remoteip', o.remoteIp);
    const res = await doFetch(TURNSTILE_URL, { method: 'POST', body: form, signal: controller.signal });
    if (!res.ok) return deny(503, 'turnstile_unavailable', 'We could not verify that request. Please try again.');
    const data = (await res.json()) as { success?: unknown };
    return data.success === true
      ? { ok: true }
      : deny(400, 'turnstile_failed', 'Verification failed. Please refresh and try again.');
  } catch {
    return deny(503, 'turnstile_unavailable', 'We could not verify that request. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}

/** Digits only, US country code removed; '' when too short to compare. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return national.length >= 7 ? national : '';
}

export interface RecentLead { id: string; email: string | null; phone: string | null }

/** The id of a recent lead with the same email (case-insensitive) or the same phone number, if any. */
export function findDuplicate(
  recent: RecentLead[],
  lead: { email: string | null; phone: string | null },
): string | null {
  const email = lead.email?.trim().toLowerCase() ?? '';
  const phone = normalizePhone(lead.phone);
  for (const r of recent) {
    if (email && r.email?.trim().toLowerCase() === email) return r.id;
    if (phone && normalizePhone(r.phone) === phone) return r.id;
  }
  return null;
}
