import { createHmac, timingSafeEqual } from 'node:crypto';

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface EmailResult { ok: boolean; id?: string; error?: string }
export interface EmailProvider { send(message: EmailMessage): Promise<EmailResult> }

export function appOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((!isLocalHttp && url.protocol !== 'https:') || url.username || url.password) return null;
    return url.origin;
  } catch { return null; }
}

export function createResendProvider(
  apiKey: string | undefined,
  fetchFn: typeof fetch = fetch,
): EmailProvider | null {
  if (!apiKey?.trim()) return null;
  return {
    async send(message) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetchFn('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            ...(message.headers ? { headers: message.headers } : {}),
          }),
        });
        const body: unknown = await response.json().catch(() => ({}));
        const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        if (!response.ok) {
          const err = record.message ?? record.error;
          return { ok: false, error: typeof err === 'string' ? err.slice(0, 500) : `email_provider_${response.status}` };
        }
        return typeof record.id === 'string'
          ? { ok: true, id: record.id }
          : { ok: false, error: 'email_provider_missing_id' };
      } catch {
        return { ok: false, error: 'email_provider_network_error' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function signUnsubscribeToken(payload: { tenantId: string; email: string; expiresAt: number }, secret: string): string {
  const body = Buffer.from(JSON.stringify({
    tenantId: payload.tenantId,
    email: payload.email.trim().toLowerCase(),
    expiresAt: payload.expiresAt,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now = Date.now(),
): { tenantId: string; email: string } | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra || !secret) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.tenantId !== 'string' || typeof row.email !== 'string' ||
        typeof row.expiresAt !== 'number' || row.expiresAt <= now ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.tenantId) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return null;
    return { tenantId: row.tenantId, email: row.email.toLowerCase() };
  } catch { return null; }
}

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

export function emailEnvelope(o: {
  from: string; to: string; subject: string; body: string; replyTo?: string;
  companyName: string; businessAddress?: string; unsubscribeUrl?: string; idempotencyKey?: string;
}): EmailMessage {
  const footer = [o.companyName, o.businessAddress].filter(Boolean).join('\n');
  const unsubscribe = o.unsubscribeUrl ? `\n\nUnsubscribe: ${o.unsubscribeUrl}` : '';
  const text = `${o.body}\n\n${footer}${unsubscribe}`;
  const html = `<div>${escapeHtml(o.body).replace(/\n/g, '<br>')}<br><br>${escapeHtml(footer).replace(/\n/g, '<br>')}${o.unsubscribeUrl ? `<br><br><a href="${escapeHtml(o.unsubscribeUrl)}">Unsubscribe</a>` : ''}</div>`;
  return {
    from: o.from, to: o.to, subject: o.subject, text, html, replyTo: o.replyTo,
    idempotencyKey: o.idempotencyKey,
    ...(o.unsubscribeUrl ? { headers: {
      'List-Unsubscribe': `<${o.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    } } : {}),
  };
}
