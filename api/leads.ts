import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleLeadsRequest, LEAD_COLUMNS, type LeadStore } from './_lib/leads.js';
import { adminClient } from './_lib/supabaseAdmin.js';
import { lookupTenant } from './_lib/tenant.js';
import { enforceRateLimit, rateLimitRpcAllowed } from './_lib/rateLimit.js';
import { createResendProvider } from './_lib/email.js';
import { sendLeadConfirmation } from './_lib/emailConfirm.js';

function toWebRequest(req: VercelRequest): Request {
  const host = req.headers.host ?? 'localhost';
  const hostname = (Array.isArray(host) ? host[0] : host) ?? 'localhost';
  const rawProto = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(rawProto) ? rawProto[0] : rawProto) ?? (hostname.startsWith('localhost') ? 'http' : 'https');
  const url = `${proto}://${hostname}${req.url ?? '/api/leads'}`;
  const headers = new Headers();
  for (const [name, raw] of Object.entries(req.headers)) {
    if (Array.isArray(raw)) raw.forEach((value) => headers.append(name, value));
    else if (raw !== undefined) headers.set(name, raw);
  }
  const method = req.method ?? 'GET';
  const body = method === 'POST'
    ? typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
    : undefined;
  return new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
}

function createStore(): LeadStore | null {
  const admin = adminClient();
  if (!admin) return null;
  return {
    async resolveWidgetKey(key) {
      const { data, error } = await admin.from('tenants').select('id').eq('widget_key', key).maybeSingle();
      if (error) throw error;
      return typeof data?.id === 'string' ? data.id : null;
    },
    async resolveUserTenant(userId) {
      const tenant = await lookupTenant(admin, userId);
      if (tenant.ok === true) return tenant.tenantId;
      if (tenant.status === 503) throw new Error('tenant_lookup_failed');
      return null;
    },
    async resolveWidgetKeyForTenant(tenantId) {
      const { data, error } = await admin.from('tenants').select('widget_key').eq('id', tenantId).maybeSingle();
      if (error) throw error;
      return typeof data?.widget_key === 'string' ? data.widget_key : null;
    },
    async list(tenantId, limit) {
      const { data, error } = await admin.from('leads')
        .select(LEAD_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
    async insert(tenantId, lead, userAgent, score) {
      const { data, error } = await admin.from('leads').insert({
        tenant_id: tenantId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        zip_code: lead.zip_code,
        zip: lead.zip_code,
        roofing_need: lead.roofing_need,
        roof_issue: lead.roofing_need,
        consent: lead.consent,
        consent_text: lead.consent_text,
        conversation: lead.conversation,
        lead_score: score,
        status: 'New Lead',
        source: 'Website Widget',
        user_agent: userAgent,
        // These legacy columns remain NOT NULL in databases that have not yet
        // applied 001_multitenant.sql. Supplying values preserves compatibility.
        session_id: crypto.randomUUID(),
        contact_key: lead.email ?? lead.phone ?? crypto.randomUUID(),
      }).select('id,lead_score').single();
      if (error) throw error;
      if (typeof data?.id !== 'string') throw new Error('lead_insert_missing_id');
      return { id: data.id, lead_score: typeof data.lead_score === 'number' ? data.lead_score : score };
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && !(await enforceRateLimit(req, res, 'widget-leads', 5, { windowSeconds: 600 }))) return;

  const store = createStore();
  const webRequest = toWebRequest(req);
  const response = await handleLeadsRequest(webRequest, {
    configured: Boolean(store),
    authenticate: async (token) => {
      if (!store) return null;
      const admin = adminClient();
      if (!admin) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user?.email_confirmed_at) return null;
      return { id: data.user.id };
    },
    afterInsert: async ({ tenantId, leadId, email }) => {
      const admin = adminClient();
      if (!admin || !email) return;
      await sendLeadConfirmation({
        provider: createResendProvider(process.env.EMAIL_PROVIDER_API_KEY),
        from: process.env.EMAIL_FROM,
        baseUrl: process.env.APP_BASE_URL,
        sessionSecret: process.env.SESSION_SECRET,
        lead: { id: leadId, tenantId, email },
        store: {
          async isSuppressed(tid, addr) {
            const { data, error } = await admin.from('email_suppressions').select('email').eq('tenant_id', tid).eq('email', addr).maybeSingle();
            if (error) throw error;
            return Boolean(data);
          },
          async companyInfo(tid) {
            const { data: owner } = await admin.from('profiles').select('user_id').eq('tenant_id', tid).limit(1).maybeSingle();
            if (!owner?.user_id) return { companyName: '', businessAddress: null };
            const { data } = await admin.from('contractor_profiles').select('company_name,business_address').eq('user_id', owner.user_id).maybeSingle();
            return {
              companyName: typeof data?.company_name === 'string' ? data.company_name : '',
              businessAddress: typeof data?.business_address === 'string' ? data.business_address : null,
            };
          },
          async allow(key, limit, windowSeconds) {
            try {
              const { data, error } = await admin.rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
              return rateLimitRpcAllowed(data, error) === true;
            } catch { return false; }
          },
        },
      });
    },
    store: store ?? {
      resolveWidgetKey: async () => null,
      resolveUserTenant: async () => null,
      resolveWidgetKeyForTenant: async () => null,
      list: async () => [],
      insert: async () => { throw new Error('database_not_configured'); },
    },
  });

  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(response.status);
  if (response.status === 204) return res.end();
  return res.send(await response.text());
}
