import { appOrigin, emailEnvelope, signUnsubscribeToken, type EmailProvider } from './email.js';
import { EMAIL_DAILY_CAP, EMAIL_MONTHLY_CAPS } from './plans.js';

export const MAX_EMAIL_ATTEMPTS = 3;
export const FOLLOWUP_DAYS = [1, 2, 4, 7] as const;

export interface ScheduledMessage {
  id: string; tenant_id: string; lead_id: string | null; to_email: string;
  subject: string; body: string; send_at: string; status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'; attempts: number;
  idempotency_key: string; sequence_key: string | null; step: number | null;
}
export interface SendContext {
  plan: 'free' | 'starter' | 'pro'; leadStatus: string | null; leadEmail: string | null;
  emailWasProvidedByLead: boolean; suppressed: boolean; companyName: string;
  businessAddress: string | null; contractorEmail: string | null;
}
export interface FollowupStore {
  claimDue(now: string, limit: number): Promise<ScheduledMessage[]>;
  getContext(message: ScheduledMessage): Promise<SendContext | null>;
  reserveUsage(tenantId: string, monthlyCap: number, dailyCap: number): Promise<boolean>;
  releaseUsage(tenantId: string): Promise<void>;
  update(messageId: string, patch: Record<string, unknown>): Promise<void>;
}
export interface WorkerResult { claimed: number; sent: number; cancelled: number; failed: number; deferred: number }

export function scheduledSequenceTimes(start: Date): Date[] {
  return FOLLOWUP_DAYS.map((day) => new Date(start.getTime() + day * 86_400_000));
}

export function sequenceEmailCopy(step: 1 | 2 | 4 | 7, name: string, companyName = 'our team', city = 'your area'): { subject: string; body: string } {
  const greeting = name.trim() ? `Hi ${name.trim()},` : 'Hello,';
  const invitation = `If you would like to book a free roof inspection in ${city.trim() || 'your area'}, reply and ${companyName.trim() || 'our team'} will help find a time.`;
  const content = step === 1
    ? { subject: 'Following up on your roof', body: `Thanks for reaching out to ${companyName.trim() || 'our team'} in ${city.trim() || 'your area'}. ${invitation}` }
    : step === 2
      ? { subject: 'Can we help with your roof?', body: `${companyName.trim() || 'Our team'} is checking in about your roofing inquiry. ${invitation}` }
      : step === 4
        ? { subject: 'Free roof inspection', body: `${invitation}` }
        : { subject: 'Here if you need roofing help', body: `This is our last scheduled follow-up. ${invitation}` };
  return { subject: content.subject, body: `${greeting}\n\n${content.body}` };
}

const CLOSED_STATUSES = new Set(['Do Not Contact', 'Closed-Lost', 'Closed-Won', 'Closed']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizedAddress = (value: string | null) => (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const backoffMs = (attempt: number) => [15 * 60_000, 60 * 60_000][Math.max(0, Math.min(attempt - 1, 1))];

export async function processDueMessages(o: {
  store: FollowupStore; provider: EmailProvider | null; from: string | undefined;
  baseUrl: string | undefined; sessionSecret: string | undefined;
  now?: () => Date; limit?: number;
}): Promise<WorkerResult> {
  const result: WorkerResult = { claimed: 0, sent: 0, cancelled: 0, failed: 0, deferred: 0 };
  // No provider configuration means retain queued rows without claiming them.
  const origin = appOrigin(o.baseUrl);
  if (!o.provider || !o.from?.trim() || !origin || !o.sessionSecret) return result;
  const now = o.now ?? (() => new Date());
  const due = await o.store.claimDue(now().toISOString(), o.limit ?? 25);
  result.claimed = due.length;
  for (const message of due) {
    let reserved = false;
    try {
      const context = await o.store.getContext(message);
      const cap = context ? EMAIL_MONTHLY_CAPS[context.plan] : 0;
      const address = normalizedAddress(context?.businessAddress ?? null);
      const addressAllowed = address.length >= 10;
      const invalid = !context || !message.lead_id || !context.leadEmail || !EMAIL_RE.test(context.leadEmail) ||
        context.leadEmail.toLowerCase() !== message.to_email.toLowerCase() ||
        !context.emailWasProvidedByLead || context.suppressed ||
        CLOSED_STATUSES.has(context.leadStatus ?? '') || cap === 0 || !addressAllowed;
      if (invalid) {
        await o.store.update(message.id, { status: 'cancelled', last_error: 'recipient, consent, address, plan, or lead status check failed' });
        result.cancelled++;
        continue;
      }
      if (!await o.store.reserveUsage(message.tenant_id, cap, EMAIL_DAILY_CAP)) {
        await o.store.update(message.id, { status: 'cancelled', last_error: 'email usage cap reached' });
        result.cancelled++;
        continue;
      }
      reserved = true;
      const token = signUnsubscribeToken({
        tenantId: message.tenant_id, email: message.to_email, expiresAt: now().getTime() + 365 * 86_400_000,
      }, o.sessionSecret);
      const unsubscribeUrl = `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}`;
      const email = emailEnvelope({
        from: o.from.trim(), to: message.to_email, subject: message.subject, body: message.body,
        replyTo: context.contractorEmail ?? undefined, companyName: context.companyName,
        businessAddress: address, unsubscribeUrl, idempotencyKey: message.idempotency_key,
      });
      const sent = await o.provider.send(email);
      if (sent.ok) {
        await o.store.update(message.id, { status: 'sent', sent_at: now().toISOString(), last_error: null, provider_id: sent.id ?? null });
        result.sent++;
      } else {
        await o.store.releaseUsage(message.tenant_id);
        reserved = false;
        const retryAt = new Date(now().getTime() + backoffMs(message.attempts));
        const exhausted = message.attempts >= MAX_EMAIL_ATTEMPTS;
        await o.store.update(message.id, {
          status: exhausted ? 'failed' : 'pending', send_at: exhausted ? message.send_at : retryAt.toISOString(),
          last_error: (sent.error ?? 'email_provider_error').slice(0, 500),
        });
        exhausted ? result.failed++ : result.deferred++;
      }
    } catch (error) {
      if (reserved) await o.store.releaseUsage(message.tenant_id).catch(() => undefined);
      const exhausted = message.attempts >= MAX_EMAIL_ATTEMPTS;
      await o.store.update(message.id, {
        status: exhausted ? 'failed' : 'pending',
        send_at: exhausted ? message.send_at : new Date(now().getTime() + backoffMs(message.attempts)).toISOString(),
        last_error: error instanceof Error ? error.message.slice(0, 500) : 'worker_error',
      });
      exhausted ? result.failed++ : result.deferred++;
    }
  }
  return result;
}
