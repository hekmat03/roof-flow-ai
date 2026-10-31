// api/agent-response.ts
// Vercel serverless function — the ONLY place the AI provider key lives.
// POST: generate a reply for one of the four agents.
// GET : report whether live AI is configured (no secrets exposed).
//
// Env vars (Vercel → Project Settings → Environment Variables):
//   MISTRAL_API_KEY   required for live AI
//   MISTRAL_MODEL     optional, defaults to mistral-small-latest

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AGENT_TYPES,
  buildSystemPrompt,
  sanitizeContext,
  sanitizeMessages,
  type AgentType,
} from './_lib/agent.js';
import { isRateLimited } from './_lib/rateLimit.js';

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
  try {
    if (await isRateLimited(req)) {
      return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }
  } catch (error) {
    console.error('Rate limiter unavailable:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'The chat service is temporarily unavailable.' });
  }
  if (!apiKey) return res.status(503).json({ error: 'AI is not configured on the server' });

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const agentType = body.agentType as AgentType;
  if (!AGENT_TYPES.includes(agentType)) {
    return res.status(400).json({ error: 'agentType must be chatbot | phone | nurturer | closer' });
  }
  if (agentType !== 'chatbot') return res.status(403).json({ error: 'Only the chatbot endpoint is enabled.' });
  const messages = sanitizeMessages(body.messages);
  if (!messages) {
    return res.status(400).json({ error: 'messages must be an array of {role, content}' });
  }

  const systemPrompt = buildSystemPrompt(agentType, sanitizeContext(body.context));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.6,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('Mistral API error:', response.status);
      return res.status(502).json({ error: 'AI provider error' });
    }
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
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
