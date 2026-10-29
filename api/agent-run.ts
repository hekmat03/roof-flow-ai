// api/agent-run.ts — tool-calling agent endpoint.
// POST: run the agent loop (reply + executed actions). GET: capability status.
//
// Env vars: MISTRAL_API_KEY (required), MISTRAL_MODEL,
//           SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (optional, persistence).
// NOTE: no email/SMS provider is wired — see the boundary note in api/_lib/tools.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AGENT_TYPES, TOOL_POLICY, buildSystemPrompt, sanitizeContext, sanitizeMessages, type AgentType,
} from './_lib/agent.js';
import {
  collectAllowedContacts, runToolLoop, type ChatFn,
} from './_lib/tools.js';
import { authenticateRequest } from './_lib/auth.js';
import { isRateLimited } from './_lib/rateLimit.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const optOuts = new Set<string>(); // best-effort per warm instance; Supabase is the durable store

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      live: Boolean(apiKey), tools: true, storage: false, email: false, model,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (await isRateLimited(req)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  } catch (error) {
    console.error('Rate limiter unavailable:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'The chat service is temporarily unavailable.' });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  if (!apiKey) return res.status(503).json({ error: 'AI is not configured on the server' });

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const agentType = body.agentType as AgentType;
  if (!AGENT_TYPES.includes(agentType)) return res.status(400).json({ error: 'invalid agentType' });
  if (agentType !== 'chatbot') return res.status(403).json({ error: 'Only the chatbot endpoint is enabled.' });
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
        db: null, sessionId: auth.user.id.replace(/-/g, ''), allowedContacts, optOuts, companyName: ctx.companyName,
      },
    });
    if (!reply) return res.status(502).json({ error: 'Empty AI reply' });
    return res.status(200).json({ reply, actions, agentType });
  } catch (err) {
    console.error('agent-run error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'AI provider error' });
  }
}
