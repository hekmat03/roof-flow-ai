import type { VercelRequest, VercelResponse } from '@vercel/node';
import { aiConfig } from './_lib/ai.js';
import { enforceRateLimit } from './_lib/rateLimit.js';

const TIMEOUT_MS = 10_000;

const PUBLIC_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

const SYSTEM_PROMPT = `You are the friendly website assistant for a roofing contractor.
You help homeowners describe roof problems and get a free inspection booked.
Rules:
- Reply in ONE short sentence (max 25 words). No lists, no markdown.
- Ask at most one question at a time: what's happening with the roof, or ZIP code, or name, or contact number.
- Never quote prices. Never promise outcomes. Never ask for payment or insurance details.
- If the visitor is upset, be calm and reassuring.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [k, v] of Object.entries(PUBLIC_HEADERS)) {
    res.setHeader(k, v);
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ai = aiConfig();
  const apiKey = ai.apiKey;
  if (!apiKey) {
    return res.status(200).json({ fallback: true });
  }

  // Throttling: 10 per minute per IP
  if (!(await enforceRateLimit(req, res, 'widget-reply', 10))) {
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .slice(-6)
    .filter((m): m is { role: string; content: string } =>
      Boolean(m && typeof m === 'object' && typeof (m as Record<string, unknown>).content === 'string')
    )
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).trim().slice(0, 500),
    }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0) {
    return res.status(200).json({ fallback: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ai.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.5,
        max_tokens: 60,
        ...ai.extra,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return res.status(200).json({ fallback: true });
    }

    const data = await response.json();
    const reply = (data?.choices?.[0]?.message?.content ?? '').toString().trim();
    if (!reply) {
      return res.status(200).json({ fallback: true });
    }

    return res.status(200).json({ fallback: false, reply });
  } catch {
    return res.status(200).json({ fallback: true });
  } finally {
    clearTimeout(timer);
  }
}
