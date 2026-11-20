import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ownerIdForTenant } from './team.js';
import { scheduledSequenceTimes, sequenceEmailCopy } from './followups.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSED = new Set(['Do Not Contact', 'Closed-Lost', 'Closed-Won', 'Closed']);
const tidy = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';

/** Called after a lead confirms its email. Schedules the 4-email sequence when the owner turned auto follow-up on. */
export async function enrollConfirmedLead(admin: SupabaseClient, tenantId: string, leadId: string): Promise<'enrolled' | 'skipped'> {
  const ownerId = await ownerIdForTenant(admin, tenantId);
  if (!ownerId) return 'skipped';
  const { data: profile, error: pErr } = await admin.from('contractor_profiles')
    .select('company_name,business_address,location,email_autofollowup').eq('user_id', ownerId).maybeSingle();
  if (pErr || !profile || profile.email_autofollowup !== true || tidy(profile.business_address).length < 10) return 'skipped';

  const { data: lead } = await admin.from('leads').select('id,name,email,status,consent,email_verified_at')
    .eq('id', leadId).eq('tenant_id', tenantId).maybeSingle();
  const email = tidy(lead?.email).toLowerCase();
  if (!lead || lead.consent !== true || !lead.email_verified_at || !EMAIL_RE.test(email) || CLOSED.has(tidy(lead.status))) return 'skipped';

  const { data: suppressed } = await admin.from('email_suppressions').select('email').eq('tenant_id', tenantId).eq('email', email).maybeSingle();
  if (suppressed) return 'skipped';
  const { data: existing } = await admin.from('scheduled_messages').select('id').eq('tenant_id', tenantId)
    .eq('lead_id', leadId).like('sequence_key', 'nurture:%').limit(1);
  if (existing?.length) return 'skipped';

  const sequenceKey = `nurture:${randomUUID()}`;
  const company = tidy(profile.company_name) || 'Your roofing company';
  const rows = scheduledSequenceTimes(new Date()).map((sendAt, i) => {
    const step = ([1, 2, 4, 7] as const)[i];
    const copy = sequenceEmailCopy(step, tidy(lead.name), company, tidy(profile.location) || 'your area');
    return {
      tenant_id: tenantId, lead_id: leadId, channel: 'email', to_email: email, subject: copy.subject, body: copy.body,
      send_at: sendAt.toISOString(), status: 'pending', attempts: 0,
      idempotency_key: `followup/${tenantId}/${sequenceKey}/${step}`, sequence_key: sequenceKey, step,
    };
  });
  const { error } = await admin.from('scheduled_messages').insert(rows);
  if (error) throw error;
  return 'enrolled';
}
