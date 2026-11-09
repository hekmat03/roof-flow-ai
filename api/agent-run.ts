// Tool-calling agent endpoint.
// POST: run the agent loop (reply + executed actions). GET: capability status.
//
// Requires a signed-in, email-verified user.
// Plan + monthly chat limit are enforced by guardChat() before any AI call.
//
// Env vars: MISTRAL_API_KEY, MISTRAL_MODEL,
//           SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Email is optional and uses EMAIL_PROVIDER_API_KEY + EMAIL_FROM; SMS remains unsupported.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AGENT_TYPES,
  TOOL_POLICY,
  buildSystemPrompt,
  sanitizeContext,
  sanitizeMessages,
  type AgentType,
} from './_lib/agent.js';
import {
  collectAllowedContacts,
  createSupabase,
  runToolLoop,
  scopedSessionId,
  type ChatFn,
} from './_lib/tools.js';
import { guardChat } from './_lib/guard.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { adminClient } from './_lib/supabaseAdmin.js';
import { appOrigin, createResendProvider } from './_lib/email.js';
import { createEmailActions, type EmailActionStore } from './_lib/emailActions.js';
import { EMAIL_DAILY_CAP, EMAIL_MONTHLY_CAPS } from './_lib/plans.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  const db = createSupabase(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const admin = adminClient();

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      live: Boolean(apiKey),
      tools: true,
      storage: Boolean(db),
      email: Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM && appOrigin(process.env.APP_BASE_URL) && process.env.SESSION_SECRET),
      model,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!apiKey) {
    return res.status(503).json({ error: 'AI is not configured on the server' });
  }

  // 10 requests / minute / IP (shared by both AI endpoints)
  if (!(await enforceRateLimit(req, res, 'ai'))) return;

  const body = (
    req.body && typeof req.body === 'object' ? req.body : {}
  ) as Record<string, unknown>;

  const agentType = body.agentType as AgentType;

  if (!AGENT_TYPES.includes(agentType)) {
    return res.status(400).json({ error: 'invalid agentType' });
  }

  const messages = sanitizeMessages(body.messages);

  if (!messages) {
    return res.status(400).json({
      error: 'messages must be an array of {role, content}',
    });
  }

  const ctx = sanitizeContext(body.context);

  const sessionId =
    typeof body.sessionId === 'string' &&
    /^[A-Za-z0-9_-]{8,64}$/.test(body.sessionId)
      ? body.sessionId
      : 'anon';

  // Auth + plan + monthly limit.
  // requireTenant: every row the tools write is stamped with the caller's company.
  const guard = await guardChat(req, res, {
    agentType,
    conversationId: body.conversationId,
    requireTenant: true,
  });

  if (!guard) return;
  if (!guard.tenantId) {
    return res.status(403).json({ error: 'Your workspace has not been created yet', code: 'no_workspace' });
  }

  const systemPrompt = buildSystemPrompt(agentType, ctx) + '\n' + TOOL_POLICY;

  const allowedContacts = collectAllowedContacts(
    messages.filter((m) => m.role === 'user').map((m) => m.content),
    [ctx.leadEmail, ctx.leadPhone],
  );
  const customerProvidedContacts = collectAllowedContacts(messages.filter((m) => m.role === 'user').map((m) => m.content));

  const emailProvider = createResendProvider(process.env.EMAIL_PROVIDER_API_KEY);
  const emailStore: EmailActionStore | null = admin ? {
    async getProfile() {
      const { data, error } = await admin.from('contractor_profiles').select('company_name,email,business_address').eq('user_id', guard.user.id).maybeSingle();
      if (error) throw error;
      return { companyName: typeof data?.company_name === 'string' ? data.company_name : 'Your roofing company', contractorEmail: typeof data?.email === 'string' ? data.email : null, businessAddress: typeof data?.business_address === 'string' ? data.business_address : null };
    },
    async findLead(email) {
      const { data, error } = await admin.from('leads').select('id,email,status,consent,conversation').eq('tenant_id', guard.tenantId).eq('email', email.toLowerCase()).limit(1).maybeSingle();
      if (error) throw error;
      const turns = Array.isArray(data?.conversation) ? data.conversation : [];
      const emailWasProvidedByLead = turns.some((turn: unknown) => {
        if (!turn || typeof turn !== 'object') return false;
        const row = turn as Record<string, unknown>;
        return typeof row.sender === 'string' && ['user', 'homeowner', 'visitor'].includes(row.sender.toLowerCase()) && typeof row.text === 'string' && row.text.toLowerCase().includes(email.toLowerCase());
      });
      return data && typeof data.id === 'string' && typeof data.email === 'string'
        ? { id: data.id, email: data.email, status: typeof data.status === 'string' ? data.status : null, consent: data.consent === true, emailWasProvidedByLead }
        : null;
    },
    async isSuppressed(email) {
      const { data: suppressed, error } = await admin.from('email_suppressions').select('email').eq('tenant_id', guard.tenantId).eq('email', email.toLowerCase()).maybeSingle();
      if (error) throw error;
      if (suppressed) return true;
      const { data: legacy, error: legacyError } = await admin.from('contact_optouts').select('contact').eq('contact', email.toLowerCase()).or(`tenant_id.eq.${guard.tenantId},tenant_id.is.null`).limit(1).maybeSingle();
      if (legacyError) throw legacyError;
      return Boolean(legacy);
    },
    async reserveUsage(monthlyCap, dailyCap) {
      const { data, error } = await admin.rpc('reserve_email_usage', { p_tenant: guard.tenantId, p_monthly_cap: monthlyCap, p_daily_cap: dailyCap });
      if (error) throw error;
      return data === true;
    },
    async releaseUsage() {
      const { error } = await admin.rpc('release_email_usage', { p_tenant: guard.tenantId });
      if (error) throw error;
    },
    async insertMessage(row) {
      const { data, error } = await admin.from('messages').insert(row).select('id').maybeSingle();
      if (error) throw error;
      return { id: typeof data?.id === 'string' ? data.id : undefined };
    },
    async insertScheduled(row) {
      const { data, error } = await admin.from('scheduled_messages').insert(row).select('id').maybeSingle();
      if (error) throw error;
      return { id: typeof data?.id === 'string' ? data.id : undefined };
    },
    async updateLeadNote(leadId, note) {
      const { data, error } = await admin.from('leads').select('note').eq('id', leadId).eq('tenant_id', guard.tenantId).maybeSingle();
      if (error) throw error;
      const prior = typeof data?.note === 'string' ? `${data.note}\n` : '';
      const { error: updateError } = await admin.from('leads').update({ note: `${prior}${note}`.slice(-2000) }).eq('id', leadId).eq('tenant_id', guard.tenantId);
      if (updateError) throw updateError;
    },
    async recordOnly(table, row) {
      const { data, error } = await admin.from(table).insert(row).select('id').maybeSingle();
      if (error) throw error;
      return { id: typeof data?.id === 'string' ? data.id : undefined };
    },
  } : null;
  const emailActions = createEmailActions({
    store: emailStore, provider: emailProvider, from: process.env.EMAIL_FROM,
    baseUrl: process.env.APP_BASE_URL, sessionSecret: process.env.SESSION_SECRET,
    tenantId: guard.tenantId, sessionId: scopedSessionId(guard.tenantId, sessionId), plan: guard.plan,
  });

  const chat: ChatFn = async (msgs, tools) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const r = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: msgs,
          temperature: 0.4,
          max_tokens: 350,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: controller.signal,
      });

      if (!r.ok) throw new Error(`provider ${r.status}`);

      const data = await r.json();
      return data?.choices?.[0]?.message ?? {};
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const { reply, actions } = await runToolLoop({
      agentType,
      systemPrompt,
      messages,
      chat,
      env: {
        db,
        tenantId: guard.tenantId,
        // Namespaced by company: a guessed/foreign session id can never touch another company's rows.
        sessionId: scopedSessionId(guard.tenantId, sessionId),
        allowedContacts,
        customerProvidedContacts,
        // Per-request only. Durable opt-outs live in the database (per company).
        optOuts: new Set<string>(),
        companyName: ctx.companyName,
        emailActions,
      },
    });

    if (!reply) {
      return res.status(502).json({ error: 'Empty AI reply' });
    }

    return res.status(200).json({ reply, actions, agentType });
  } catch (err) {
    console.error(
      'agent-run error:',
      err instanceof Error ? err.message : err,
    );
    return res.status(502).json({ error: 'AI provider error' });
  }
}
