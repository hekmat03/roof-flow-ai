// api/agent-run.ts — tool-calling agent endpoint.
// POST: run the agent loop (reply + executed actions). GET: capability status.
//
// Env vars: MISTRAL_API_KEY (required), MISTRAL_MODEL,
//           SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (optional, persistence),
//           RESEND_API_KEY + RESEND_FROM (optional, real email).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AGENT_TYPES, TOOL_POLICY, buildSystemPrompt, rateLimited, sanitizeContext, sanitizeMessages, type AgentType,
} from './_lib/agent.js';
import {
  collectAllowedContacts, createSupabase, runToolLoop, type ChatFn,
} from './_lib/tools.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const optOuts = new Set<string>(); // best-effort per warm instance; Supabase is the durable store

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  const db = createSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      live: Boolean(apiKey), tools: true, storage: Boolean(db), email: Boolean(process.env.RESEND_API_KEY), model,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!apiKey) return res.status(503).json({ error: 'AI is not configured on the server' });

  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`run:${ip}`, 20)) return res.status(429).json({ error: 'Too many requests, please slow down' });

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const agentType = body.agentType as AgentType;
  if (!AGENT_TYPES.includes(agentType)) return res.status(400).json({ error: 'invalid agentType' });
  const messages = sanitizeMessages(body.messages);
  if (!messages) return res.status(400).json({ error: 'messages must be an array of {role, content}' });
  const ctx = sanitizeContext(body.context);
  const sessionId = typeof body.sessionId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.sessionId) ? body.sessionId : 'anon';

  const systemPrompt = buildSystemPrompt(agentType, ctx) + '\n' + TOOL_POLICY;
  const allowedContacts = collectAllowedContacts(
    messages.filter((m) => m.role === 'user').map((m) => m.content),
    [ctx.leadEmail, ctx.leadPhone],
  );

  const chat: ChatFn = async (msgs, tools) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: msgs, temperature: 0.4, max_tokens: 350, ...(tools ? { tools, tool_choice: 'auto' } : {}) }),
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
      agentType, systemPrompt, messages, chat,
      env: {
        db, sessionId, allowedContacts, optOuts, companyName: ctx.companyName,
        resendKey: process.env.RESEND_API_KEY, resendFrom: process.env.RESEND_FROM,
      },
    });
    if (!reply) return res.status(502).json({ error: 'Empty AI reply' });
    return res.status(200).json({ reply, actions, agentType });
  } catch (err) {
    console.error('agent-run error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'AI provider error' });
  }
}
