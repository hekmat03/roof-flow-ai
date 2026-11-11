import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { adminClient, userFromRequest } from './_lib/supabaseAdmin.js';
import { lookupTenant } from './_lib/tenant.js';
import { getProfile, effectivePlan } from './_lib/billing.js';
import { appOrigin, createResendProvider, emailEnvelope, signUnsubscribeToken } from './_lib/email.js';
import { scheduledSequenceTimes, sequenceEmailCopy } from './_lib/followups.js';
import { EMAIL_MONTHLY_CAPS, EMAIL_DAILY_CAP } from './_lib/plans.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ADDRESS_LENGTH = 10;
const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);
const tidy = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
const toArray = (v: unknown): Array<Record<string, unknown>> => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

function emailInLeadConversation(conversation: unknown, email: string): boolean {
  const target = email.trim().toLowerCase();
  return toArray(conversation).some((turn) => {
    const sender = tidy(turn.sender).toLowerCase();
    const text = tidy(turn.text).toLowerCase();
    return ['user', 'homeowner', 'visitor'].includes(sender) && text.includes(target);
  });
}

function sameOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const protoRaw = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoRaw) ? protoRaw[0] : protoRaw;
  try { return new URL(origin).origin === `${proto || 'https'}://${host}`; } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden_origin' });
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) return json(res, 405, { error: 'method_not_allowed' });
  const admin = adminClient();
  if (!admin) return json(res, 503, { error: 'storage_not_configured' });
  const user = await userFromRequest(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  const tenant = await lookupTenant(admin, user.id);
  if (tenant.ok === false) return json(res, tenant.status, { error: tenant.code });
  const plan = effectivePlan(await getProfile(admin, user.id));
  if (plan === 'free') return json(res, 403, { error: 'Email follow-ups require Starter or Pro.', code: 'upgrade_required', plan });
  const cap = EMAIL_MONTHLY_CAPS[plan];
  const provider = createResendProvider(process.env.EMAIL_PROVIDER_API_KEY);
  const from = process.env.EMAIL_FROM?.trim();
  const origin = appOrigin(process.env.APP_BASE_URL);
  const configured = Boolean(provider && from && process.env.SESSION_SECRET && origin);
  const action = typeof req.body?.action === 'string' ? req.body.action : '';

  try {
    const { data: profile, error: profileError } = await admin.from('contractor_profiles')
      .select('company_name,email,business_address,location').eq('user_id', user.id).maybeSingle();
    if (profileError) throw profileError;
    const companyName = tidy(profile?.company_name) || 'Your roofing company';
    const businessAddress = tidy(profile?.business_address);

    if (req.method === 'GET') {
      const { data, error } = await admin.from('scheduled_messages')
        .select('id,lead_id,to_email,subject,send_at,status,attempts,last_error,sequence_key,step,created_at,sent_at')
        .eq('tenant_id', tenant.tenantId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return json(res, 200, { ok: true, configured, messages: data ?? [], businessAddressReady: businessAddress.length >= MIN_ADDRESS_LENGTH });
    }

    if (action === 'cancel-estimate' && req.method === 'DELETE') {
      const leadId = tidy(req.body?.leadId);
      if (!UUID_RE.test(leadId)) return json(res, 400, { error: 'invalid_lead_id' });
      const { data, error } = await admin.from('scheduled_messages').update({ status: 'cancelled', last_error: 'estimate follow-up opted out by contractor' })
        .eq('tenant_id', tenant.tenantId).eq('lead_id', leadId).like('sequence_key', 'estimate:%').eq('status', 'pending')
        .select('id');
      if (error) throw error;
      return json(res, 200, { ok: true, cancelled: data?.length ?? 0 });
    }
    if (action === 'cancel' && req.method === 'DELETE') {
      const id = tidy(req.body?.id);
      if (!UUID_RE.test(id)) return json(res, 400, { error: 'invalid_message_id' });
      const { data, error } = await admin.from('scheduled_messages').update({ status: 'cancelled', last_error: 'cancelled by contractor' })
        .eq('id', id).eq('tenant_id', tenant.tenantId).eq('status', 'pending').select('id').maybeSingle();
      if (error) throw error;
      if (!data) return json(res, 404, { error: 'pending_message_not_found' });
      return json(res, 200, { ok: true, id });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

    const sessionSecret = process.env.SESSION_SECRET;

    if (action === 'test') {
      if (!configured) return json(res, 503, { error: 'Email is not configured; the test was not sent.', code: 'email_not_configured', configured: false });
      const recipient = tidy(profile?.email || user.email).toLowerCase();
      if (!EMAIL_RE.test(recipient)) return json(res, 400, { error: 'A valid contractor email is required for the test.' });
      const { data: allowed } = await admin.rpc('reserve_email_usage', { p_tenant: tenant.tenantId, p_monthly_cap: cap, p_daily_cap: EMAIL_DAILY_CAP });
      if (allowed !== true) return json(res, 429, { error: 'Email usage cap reached.' });
      const token = signUnsubscribeToken({ tenantId: tenant.tenantId, email: recipient, expiresAt: Date.now() + 365 * 86_400_000 }, sessionSecret!);
      const url = `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}`;
      const sent = await provider!.send(emailEnvelope({
        from: from!, to: recipient, subject: 'RoofFlow AI email setup test',
        body: 'This is a test email from your RoofFlow AI workspace.', replyTo: recipient,
        companyName, businessAddress: businessAddress || undefined, unsubscribeUrl: url,
        idempotencyKey: `test/${tenant.tenantId}/${randomUUID()}`,
      }));
      if (!sent.ok) await admin.rpc('release_email_usage', { p_tenant: tenant.tenantId });
      return json(res, sent.ok ? 200 : 502, sent.ok ? { ok: true, id: sent.id } : { error: sent.error || 'email_provider_error' });
    }

    if (action !== 'sequence' && action !== 'estimate') return json(res, 400, { error: 'invalid_action' });
    if (businessAddress.length < MIN_ADDRESS_LENGTH) return json(res, 409, { error: 'Add your business mailing address to send email follow-ups.', code: 'business_address_required' });
    const leadId = tidy(req.body?.leadId);
    if (!UUID_RE.test(leadId)) return json(res, 400, { error: 'invalid_lead_id' });
    const { data: lead, error: leadError } = await admin.from('leads')
      .select('id,tenant_id,name,email,status,consent,conversation,note,email_verified_at')
      .eq('id', leadId).eq('tenant_id', tenant.tenantId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead || !EMAIL_RE.test(tidy(lead.email)) || lead.consent !== true || !emailInLeadConversation(lead.conversation, tidy(lead.email))) {
      return json(res, 400, { error: 'A consented lead with an email provided in conversation is required.' });
    }
    if (!lead.email_verified_at) {
      return json(res, 409, { error: 'This lead has not confirmed their email address yet.', code: 'email_not_verified' });
    }
    const { data: suppression, error: suppressError } = await admin.from('email_suppressions').select('email')
      .eq('tenant_id', tenant.tenantId).eq('email', tidy(lead.email).toLowerCase()).maybeSingle();
    if (suppressError) throw suppressError;
    const { data: legacyOptout, error: legacyOptoutError } = await admin.from('contact_optouts').select('contact')
      .eq('contact', tidy(lead.email).toLowerCase()).or(`tenant_id.eq.${tenant.tenantId},tenant_id.is.null`).limit(1).maybeSingle();
    if (legacyOptoutError) throw legacyOptoutError;
    if (suppression || legacyOptout) return json(res, 409, { error: 'This lead has opted out of email.' });
    if (['Do Not Contact', 'Closed-Lost', 'Closed-Won', 'Closed'].includes(tidy(lead.status))) return json(res, 409, { error: 'This lead is not eligible for follow-up.' });
    if (action === 'estimate' && tidy(lead.status) !== 'Estimate Sent') return json(res, 409, { error: 'Estimate follow-up is available only after the lead reaches Estimate Sent.' });

    if (!configured) {
      const activity = action === 'estimate' ? 'Estimate follow-up email recorded only; email is not configured.' : 'Day 1/2/4/7 email follow-up recorded only; email is not configured.';
      const existingNote = typeof lead.note === 'string' ? lead.note.trim() : '';
      const note = `${existingNote}${existingNote ? '\n' : ''}${activity}`.slice(-2000);
      const { error: recordError } = await admin.from('messages').insert({
        tenant_id: tenant.tenantId, session_id: `${tenant.tenantId}:${randomUUID()}`, channel: 'email', recipient: tidy(lead.email).toLowerCase(),
        subject: action === 'estimate' ? 'Following up on your roofing estimate' : 'Following up on your roofing inquiry',
        body: note, status: 'recorded_only',
      });
      if (recordError) throw recordError;
      const { error: noteError } = await admin.from('leads').update({ note }).eq('id', lead.id).eq('tenant_id', tenant.tenantId);
      if (noteError) throw noteError;
      return json(res, 200, { ok: true, recordedOnly: true, configured: false });
    }
    if (!sessionSecret || !origin) return json(res, 503, { error: 'Email signing or base URL is not configured.' });

    const now = new Date();
    const times = action === 'sequence' ? scheduledSequenceTimes(now) : [new Date(now.getTime() + 86_400_000)];
    const sequenceKey = `${action === 'estimate' ? 'estimate' : 'nurture'}:${randomUUID()}`;
    const requestedEmails = req.body?.emails;
    if (action === 'sequence' && requestedEmails !== undefined && (!Array.isArray(requestedEmails) || requestedEmails.length !== 4)) {
      return json(res, 400, { error: 'Provide email subject and body for each sequence day.' });
    }
    if (action === 'sequence' && Array.isArray(requestedEmails)) {
      const validDrafts = requestedEmails.every((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return false;
        const draft = entry as { step?: unknown; subject?: unknown; body?: unknown };
        return [1, 2, 4, 7].includes(draft.step as number) && typeof draft.subject === 'string' &&
          typeof draft.body === 'string' && tidy(draft.subject).length > 0 && tidy(draft.body).length > 0 &&
          draft.subject.length <= 180 && draft.body.length <= 5000;
      });
      const steps = requestedEmails.map((entry: { step?: unknown }) => entry.step);
      if (!validDrafts || new Set(steps).size !== 4 || ![1, 2, 4, 7].every(step => steps.includes(step))) {
        return json(res, 400, { error: 'Email drafts must include a subject and body for Day 1, 2, 4, and 7.' });
      }
    }
    const rows = times.map((sendAt, index) => {
      const step = action === 'sequence' ? ([1, 2, 4, 7] as const)[index] : 1;
      const requested = action === 'sequence' && Array.isArray(requestedEmails)
        ? requestedEmails.find((entry: unknown) => entry && typeof entry === 'object' && (entry as { step?: unknown }).step === step) as { subject?: unknown; body?: unknown } | undefined
        : undefined;
      const copy = action === 'sequence' ? sequenceEmailCopy(step, tidy(lead.name), companyName, tidy(profile?.location) || 'your area') : {
        subject: 'Following up on your roofing estimate',
        body: `${tidy(lead.name) ? `Hi ${tidy(lead.name)},` : 'Hello,'}\n\nWe are following up on the estimate we sent. If you have questions or would like to discuss it, reply to this email and our team will help.`,
      };
      return {
        tenant_id: tenant.tenantId, lead_id: lead.id, channel: 'email', to_email: tidy(lead.email).toLowerCase(),
        subject: requested ? tidy(requested.subject).slice(0, 180) : copy.subject,
        body: requested ? String(requested.body).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : copy.body,
        send_at: sendAt.toISOString(), status: 'pending', attempts: 0,
        idempotency_key: `followup/${tenant.tenantId}/${sequenceKey}/${step}`,
        sequence_key: sequenceKey, step,
      };
    });
    const { data: inserted, error } = await admin.from('scheduled_messages').insert(rows).select('id,send_at,status,step');
    if (error) throw error;
    const activity = action === 'estimate' ? 'Estimate follow-up email scheduled.' : 'Day 1/2/4/7 follow-up email sequence scheduled.';
    const existingNote = typeof lead.note === 'string' ? lead.note.trim() : '';
    const note = `${existingNote}${existingNote ? '\n' : ''}${activity}`.slice(-2000);
    const { error: noteError } = await admin.from('leads').update({ note }).eq('id', lead.id).eq('tenant_id', tenant.tenantId);
    if (noteError) {
      const ids = (inserted ?? []).map((row: { id: string }) => row.id);
      if (ids.length) await admin.from('scheduled_messages').update({ status: 'cancelled', last_error: 'CRM note could not be saved' }).in('id', ids);
      throw noteError;
    }
    const { error: logError } = await admin.from('messages').insert({ tenant_id: tenant.tenantId, session_id: `${tenant.tenantId}:${randomUUID()}`, channel: 'email', recipient: tidy(lead.email).toLowerCase(), subject: rows[0].subject, body: note, status: 'scheduled' });
    if (logError) {
      const ids = (inserted ?? []).map((row: { id: string }) => row.id);
      if (ids.length) await admin.from('scheduled_messages').update({ status: 'cancelled', last_error: 'Outreach log could not be saved' }).in('id', ids);
      throw logError;
    }
    return json(res, 201, { ok: true, messages: inserted ?? [] });
  } catch (error) {
    console.error('followups API error:', error instanceof Error ? error.message : 'unknown');
    return json(res, 503, { error: 'Follow-up service unavailable. Confirm migration 009 is installed.' });
  }
        }
