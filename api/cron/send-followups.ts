import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { appOrigin, createResendProvider } from '../_lib/email.js';
import { processDueMessages, type FollowupStore, type ScheduledMessage } from '../_lib/followups.js';
import { effectivePlan } from '../_lib/billing.js';
import { hasCronAuthorization } from '../_lib/cronAuth.js';
import { EMAIL_MONTHLY_CAPS } from '../_lib/plans.js';

export const config = { maxDuration: 60 };

const tidy = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const emailProvided = (conversation: unknown, email: string): boolean => Array.isArray(conversation) && conversation.some((turn) => {
  if (!turn || typeof turn !== 'object') return false;
  const row = turn as Record<string, unknown>;
  return ['user', 'homeowner', 'visitor'].includes(tidy(row.sender).toLowerCase()) &&
    typeof row.text === 'string' && row.text.toLowerCase().includes(email.toLowerCase());
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  if (!hasCronAuthorization(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized' });
  const admin = adminClient();
  if (!admin) return res.status(503).json({ error: 'Storage is not configured' });
  const provider = createResendProvider(process.env.EMAIL_PROVIDER_API_KEY);
  const store: FollowupStore = {
    async claimDue(_now, limit) {
      const { data, error } = await admin.rpc('claim_due_scheduled_messages', { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as ScheduledMessage[];
    },
    async getContext(message) {
      if (!message.lead_id) return null;
      const [{ data: lead, error: leadError }, { data: userProfile, error: userError }] = await Promise.all([
        admin.from('leads').select('email,status,consent,conversation,email_verified_at').eq('id', message.lead_id).eq('tenant_id', message.tenant_id).maybeSingle(),
        admin.from('profiles').select('user_id,current_plan,subscription_status,current_period_end').eq('tenant_id', message.tenant_id).maybeSingle(),
      ]);
      if (leadError || userError) throw leadError || userError;
      if (!lead || !userProfile) return null;
      const { data: profile, error: contractorError } = await admin.from('contractor_profiles')
        .select('company_name,email,business_address').eq('user_id', userProfile.user_id).maybeSingle();
      if (contractorError) throw contractorError;
      const { data: suppression, error: suppressionError } = await admin.from('email_suppressions')
        .select('email').eq('tenant_id', message.tenant_id).eq('email', message.to_email.toLowerCase()).maybeSingle();
      if (suppressionError) throw suppressionError;
      const { data: legacyOptout, error: legacyOptoutError } = await admin.from('contact_optouts')
        .select('contact').eq('contact', message.to_email.toLowerCase()).or(`tenant_id.eq.${message.tenant_id},tenant_id.is.null`).limit(1).maybeSingle();
      if (legacyOptoutError) throw legacyOptoutError;
      return {
        plan: effectivePlan(userProfile), leadStatus: typeof lead.status === 'string' ? lead.status : null,
        leadEmail: typeof lead.email === 'string' ? lead.email : null,
        emailWasProvidedByLead: lead.consent === true && lead.email_verified_at != null && emailProvided(lead.conversation, message.to_email),
        suppressed: Boolean(suppression || legacyOptout), companyName: tidy(profile?.company_name) || 'Your roofing company',
        businessAddress: typeof profile?.business_address === 'string' ? profile.business_address : null,
        contractorEmail: typeof profile?.email === 'string' ? profile.email : null,
      };
    },
    async reserveUsage(tenantId, monthlyCap, dailyCap) {
      const { data, error } = await admin.rpc('reserve_email_usage', { p_tenant: tenantId, p_monthly_cap: monthlyCap, p_daily_cap: dailyCap });
      if (error) throw error;
      return data === true;
    },
    async releaseUsage(tenantId) {
      const { error } = await admin.rpc('release_email_usage', { p_tenant: tenantId });
      if (error) throw error;
    },
    async update(messageId, patch) {
      const { error } = await admin.from('scheduled_messages').update(patch).eq('id', messageId);
      if (error) throw error;
    },
  };
  try {
    const result = await processDueMessages({
      store, provider, from: process.env.EMAIL_FROM, baseUrl: process.env.APP_BASE_URL,
      sessionSecret: process.env.SESSION_SECRET, limit: 5,
    });
    return res.status(200).json({ ok: true, ...result, configured: Boolean(provider && process.env.EMAIL_FROM && process.env.SESSION_SECRET && appOrigin(process.env.APP_BASE_URL)) });
  } catch (error) {
    console.error('follow-up worker error:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).json({ error: 'Follow-up worker unavailable' });
  }
}
