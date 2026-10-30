// Vercel serverless function — the ONLY place the AI provider key lives.
// POST: generate a reply for one of the four agents.
// GET : report whether live AI is configured (no secrets exposed).
//
// Requires a signed-in, email-verified user (Authorization: Bearer <supabase token>).
// Plan + monthly chat limit are enforced by guardChat() before any AI call.
//
// Env vars (Vercel → Project Settings → Environment Variables):
//   MISTRAL_API_KEY   required for live AI
//   MISTRAL_MODEL     optional, defaults to mistral-small-latest
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   required (auth + usage)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AGENT_TYPES,
  buildSystemPrompt,
  rateLimited,
  sanitizeContext,
  sanitizeMessages,
  type AgentType,
} from './_lib/agent.js';
import { guardChat } from './_lib/guard.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ live: Boolean(apiKey), provider: 'mistral', model });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!apiKey) {
    return res.status(503).json({ error: 'AI is not configured on the server' });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'unknown';

  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests, please slow down' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const agentType = body.agentType as AgentType;

  if (!AGENT_TYPES.includes(agentType)) {
    return res.status(400).json({ error: 'agentType must be chatbot | phone | nurturer | closer' });
  }

  const messages = sanitizeMessages(body.messages);
  if (!messages) {
    return res.status(400).json({ error: 'messages must be an array of {role, content}' });
  }

  // Auth + plan + monthly limit (sends the response itself when blocked).
  const guard = await guardChat(req, res, { agentType, conversationId: body.conversationId });
  if (!guard) return;

  const systemPrompt = buildSystemPrompt(agentType, sanitizeContext(body.context));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.6,
        max_tokens: agentType === 'phone' ? 120 : 300,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('Mistral API error:', response.status);
      return res.status(502).json({ error: 'AI provider error' });
    }

    const data = await response.json();
    const reply: string = (data?.choices?.[0]?.message?.content ?? '').toString().trim();

    if (!reply) return res.status(502).json({ error: 'Empty AI reply' });

    return res.status(200).json({ reply, agentType });
  } catch (err) {
    console.error('agent-response error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error generating response' });
  } finally {
    clearTimeout(timer);
  }
}
