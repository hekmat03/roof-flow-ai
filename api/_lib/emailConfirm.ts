// Double opt-in for widget leads: send a confirmation link to the address the
// visitor typed, and mark the lead's email verified only when that link is used.
import { createHash } from 'node:crypto';
import {
  appOrigin,
  emailEnvelope,
  signLeadConfirmToken,
  verifyLeadConfirmToken,
  type EmailProvider,
} from './email.js';

export const CONFIRM_TTL_MS = 7 * 86_400_000;
const DAY = 86_400;
/** Abuse limits: a confirmation mail is itself an email to a stranger. */
export const CONFIRM_LIMITS = {
  perEmailPerDay: 2,
  perTenantPerDay: 50,
  globalPerDay: 500,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const tidy = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export interface ConfirmSendStore {
  isSuppressed(tenantId: string, email: string): Promise<boolean>;
  companyInfo(tenantId: string): Promise<{ companyName: string; businessAddress: string | null }>;
  /** Consume one unit of a named limit. MUST return false when it cannot tell (fail closed). */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export type ConfirmSendResult = { status: 'sent' } | { status: 'skipped' | 'failed'; reason: string };

export async function sendLeadConfirmation(o: {
  store: ConfirmSendStore;
  provider: EmailProvider | null;
  from: string | undefined;
  baseUrl: string | undefined;
  sessionSecret: string | undefined;
  lead: { id: string; tenantId: string; email: string };
  now?: () => Date;
}): Promise<ConfirmSendResult> {
  const origin = appOrigin(o.baseUrl);
  if (!o.provider || !o.from?.trim() || !origin || !o.sessionSecret) return { status: 'skipped', reason: 'not_configured' };
  const email = o.lead.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 'skipped', reason: 'invalid_email' };

  try {
    if (await o.store.isSuppressed(o.lead.tenantId, email)) return { status: 'skipped', reason: 'suppressed' };

    const hash = createHash('sha256').update(email).digest('hex');
    if (!(await o.store.allow(`confirm-email:${hash}`, CONFIRM_LIMITS.perEmailPerDay, DAY))) return { status: 'skipped', reason: 'email_throttled' };
    if (!(await o.store.allow(`confirm-tenant:${o.lead.tenantId}`, CONFIRM_LIMITS.perTenantPerDay, DAY))) return { status: 'skipped', reason: 'tenant_throttled' };
    if (!(await o.store.allow('confirm-all', CONFIRM_LIMITS.globalPerDay, DAY))) return { status: 'skipped', reason: 'global_throttled' };

    const info = await o.store.companyInfo(o.lead.tenantId);
    const company = tidy(info.companyName, 80) || 'a roofing company';
    const now = (o.now ?? (() => new Date()))();
    const token = signLeadConfirmToken(
      { leadId: o.lead.id, tenantId: o.lead.tenantId, email, expiresAt: now.getTime() + CONFIRM_TTL_MS },
      o.sessionSecret,
    );
    const url = `${origin}/api/confirm-email?token=${encodeURIComponent(token)}`;
    const result = await o.provider.send(emailEnvelope({
      from: o.from.trim(),
      to: email,
      subject: `Confirm your email for ${company}`,
      body:
        `Hello,\n\nYou asked ${company} to contact you about a roof inspection. ` +
        `Please confirm that this is your email address:\n\n${url}\n\n` +
        'This link expires in 7 days. If you did not make this request, ignore this email and you will not be contacted by email.',
      companyName: company,
      businessAddress: tidy(info.businessAddress, 200) || undefined,
      idempotencyKey: `confirm/${o.lead.tenantId}/${o.lead.id}/${hash.slice(0, 16)}`,
    }));
    return result.ok ? { status: 'sent' } : { status: 'failed', reason: result.error ?? 'provider_error' };
  } catch {
    return { status: 'failed', reason: 'exception' };
  }
}

export interface ConfirmLeadStore {
  getLead(leadId: string, tenantId: string): Promise<{ email: string | null; email_verified_at: string | null } | null>;
  /** Sets email_verified_at only if the stored email is still exactly `email`. */
  markVerified(leadId: string, tenantId: string, email: string): Promise<void>;
}

export type ConfirmOutcome = 'confirmed' | 'already' | 'invalid';

export async function confirmLeadEmail(
  store: ConfirmLeadStore,
  token: string,
  secret: string | undefined,
  now = Date.now(),
): Promise<ConfirmOutcome> {
  if (!secret) return 'invalid';
  const payload = verifyLeadConfirmToken(token, secret, now);
  if (!payload) return 'invalid';
  const lead = await store.getLead(payload.leadId, payload.tenantId);
  if (!lead?.email || lead.email.trim().toLowerCase() !== payload.email) return 'invalid';
  if (lead.email_verified_at) return 'already';
  await store.markVerified(payload.leadId, payload.tenantId, lead.email);
  return 'confirmed';
}
