import { createHash, randomUUID } from 'node:crypto';
import { EMAIL_DAILY_CAP, EMAIL_MONTHLY_CAPS, type PlanId } from './plans.js';
import { appOrigin, emailEnvelope, signUnsubscribeToken, type EmailProvider } from './email.js';
import type { ToolResult } from './tools.js';

export interface ContractorEmailProfile {
  companyName: string;
  contractorEmail: string | null;
  businessAddress: string | null;
}
export interface OutreachLead {
  id: string;
  email: string;
  status: string | null;
  consent: boolean;
  emailWasProvidedByLead: boolean;
}
export interface EmailActionStore {
  getProfile(): Promise<ContractorEmailProfile>;
  findLead(email: string): Promise<OutreachLead | null>;
  isSuppressed(email: string): Promise<boolean>;
  reserveUsage(monthlyCap: number, dailyCap: number): Promise<boolean>;
  releaseUsage(): Promise<void>;
  insertMessage(row: Record<string, unknown>): Promise<{ id?: string }>;
  insertScheduled(row: Record<string, unknown>): Promise<{ id?: string }>;
  updateLeadNote(leadId: string, note: string): Promise<void>;
  recordOnly(table: 'messages' | 'followups', row: Record<string, unknown>): Promise<{ id?: string }>;
}

const fail = (error: string): ToolResult => ({ ok: false, status: 'failed', simulated: false, persisted: false, error });
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ADDRESS_LENGTH = 10;
const blockedStatus = new Set(['Do Not Contact', 'Closed-Lost', 'Closed-Won', 'Closed']);

export function createEmailActions(o: {
  store: EmailActionStore | null; provider: EmailProvider | null; from?: string;
  baseUrl?: string; sessionSecret?: string; tenantId: string; sessionId: string;
  plan: PlanId; now?: () => Date;
}) {
  const now = o.now ?? (() => new Date());
  const origin = appOrigin(o.baseUrl);
  const configured = Boolean(o.store && o.provider && o.from?.trim() && origin && o.sessionSecret);

  async function sendEmail(input: { to: string; subject: string; body: string }): Promise<ToolResult> {
    if (!VALID_EMAIL.test(input.to)) return fail('invalid_email');
    if (o.plan === 'free') return fail('email_followups_require_starter_or_pro');
    if (!o.store) return { ok: true, status: 'recorded_only', simulated: true, persisted: false, detail: 'Email is not configured; recorded only.' };
    if (!configured) {
      const saved = await o.store.recordOnly('messages', { tenant_id: o.tenantId, session_id: o.sessionId, channel: 'email', recipient: input.to, subject: input.subject, body: input.body, status: 'recorded_only' });
      return { ok: true, status: 'recorded_only', simulated: true, persisted: true, id: saved.id, detail: 'Email is not configured; recorded only.' };
    }
    if (await o.store.isSuppressed(input.to)) return fail('contact opted out');
    const profile = await o.store.getProfile();
    const businessAddress = profile.businessAddress?.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    const reserved = await o.store.reserveUsage(EMAIL_MONTHLY_CAPS[o.plan], EMAIL_DAILY_CAP);
    if (!reserved) return fail('email_usage_limit_reached');
    const token = signUnsubscribeToken({ tenantId: o.tenantId, email: input.to, expiresAt: now().getTime() + 365 * 86_400_000 }, o.sessionSecret!);
    const unsubscribeUrl = `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}`;
    const idempotencyHash = createHash('sha256').update(`${o.tenantId}\n${o.sessionId}\n${input.to.toLowerCase()}\n${input.subject}\n${input.body}`).digest('hex');
    const result = await o.provider!.send(emailEnvelope({
      from: o.from!.trim(), to: input.to, subject: input.subject, body: input.body,
      replyTo: profile.contractorEmail ?? undefined, companyName: profile.companyName,
      businessAddress: businessAddress || undefined, unsubscribeUrl,
      idempotencyKey: `single/${o.tenantId}/${idempotencyHash}`,
    }));
    if (!result.ok) {
      await o.store.releaseUsage();
      await o.store.insertMessage({ tenant_id: o.tenantId, session_id: o.sessionId, channel: 'email', recipient: input.to, subject: input.subject, body: input.body, status: 'failed' });
      return fail(result.error || 'email_provider_error');
    }
    const saved = await o.store.insertMessage({ tenant_id: o.tenantId, session_id: o.sessionId, channel: 'email', recipient: input.to, subject: input.subject, body: input.body, status: 'sent' });
    const lead = await o.store.findLead(input.to);
    if (lead) await o.store.updateLeadNote(lead.id, `Email sent: ${input.subject}`);
    return { ok: true, status: 'sent', simulated: false, persisted: true, id: saved.id, detail: 'Email sent.' };
  }

  async function scheduleEmail(input: { contact: string; whenHours: number; hint: string }): Promise<ToolResult> {
    if (!VALID_EMAIL.test(input.contact)) return fail('invalid_email');
    if (o.plan === 'free') return fail('email_followups_require_starter_or_pro');
    if (!o.store) return fail('business_mailing_address_and_storage_required_for_scheduled_email');
    const profile = await o.store.getProfile();
    const businessAddress = profile.businessAddress?.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
    if (businessAddress.length < MIN_ADDRESS_LENGTH) return fail('business_mailing_address_required_for_scheduled_email');
    if (!configured) {
      const saved = await o.store.recordOnly('followups', { tenant_id: o.tenantId, session_id: o.sessionId, channel: 'email', contact: input.contact, due_at: new Date(now().getTime() + input.whenHours * 3_600_000).toISOString(), hint: input.hint, status: 'recorded_only' });
      return { ok: true, status: 'recorded_only', simulated: true, persisted: true, id: saved.id, detail: 'Email follow-up is not configured; recorded only.' };
    }
    const lead = await o.store.findLead(input.contact);
    if (!lead || !lead.consent || !lead.emailWasProvidedByLead || lead.email.toLowerCase() !== input.contact.toLowerCase()) return fail('consented_lead_email_required');
    if (blockedStatus.has(lead.status ?? '')) return fail('lead_not_eligible_for_followup');
    if (await o.store.isSuppressed(input.contact)) return fail('contact opted out');
    const idempotencyKey = `tool-followup/${o.tenantId}/${randomUUID()}`;
    const dueAt = new Date(now().getTime() + input.whenHours * 3_600_000).toISOString();
    const subject = 'Following up on your roofing inquiry';
    const body = 'We are following up about your roofing inquiry. Please reply if you still need help from our team.';
    const saved = await o.store.insertScheduled({ tenant_id: o.tenantId, lead_id: lead.id, channel: 'email', to_email: input.contact.toLowerCase(), subject, body, send_at: dueAt, status: 'pending', attempts: 0, idempotency_key: idempotencyKey, sequence_key: `tool:${randomUUID()}`, step: null });
    await o.store.updateLeadNote(lead.id, `Email follow-up scheduled for ${dueAt}.`);
    return { ok: true, status: 'scheduled', simulated: false, persisted: true, id: saved.id, detail: 'Email follow-up scheduled.' };
  }

  return { sendEmail, scheduleEmail, configured };
}
