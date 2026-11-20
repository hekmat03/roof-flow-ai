// api/demo-chat.ts — PUBLIC product-demo chat for the landing page.
// No login, so it is locked down: fixed server-side prompt (the browser cannot
// change it), no tools, no CRM, no contact collection, short replies, and strict
// per-IP AND global daily caps so it can never run up your AI bill.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { aiConfig } from './_lib/ai.js';

const MAX_TURNS = 6;
const MAX_CHARS = 400;

const DEMO_PROMPT = `You are the public product demo assistant for RoofFlow AI, software that helps roofing contractors answer homeowner inquiries, capture consented leads, manage them in a CRM, and book roof inspections.
Rules:
- Use ONLY the facts below. If something is not listed, say RoofFlow does not offer it or that you are not sure. Never invent features, statistics, customers, results or guarantees.
- Facts: a chat widget for the contractor's website asks about the roof concern and ZIP, collects contact details and explicit follow-up consent, and sends the conversation to the contractor's CRM board (Starter and Pro). Google Calendar can book inspections. Scheduled follow-up emails (Starter and Pro) go only to consenting leads and include an unsubscribe link. A team workspace supports an owner, admins and members.
- NOT available yet (coming soon, no date promised): text messages (SMS) and live phone calls (the voice agent is only a browser simulator today). Also not offered: proof that a phone number or email belongs to the visitor (formats are checked only).
- Plans: Free (20 chats/month), Starter $19 (250 chats, CRM, email follow-ups), Pro $39 (1,000 chats, CRM, email and estimate follow-ups).
- Never ask for or repeat personal details (names, phone numbers, emails, addresses). If the visitor shares any, tell them not to share personal details in this demo.
- Never claim this demo books appointments, creates leads, or saves anything.
- Keep every reply under 80 words. Be friendly and plain. If asked about unrelated topics, say you can only talk about RoofFlow AI.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ai = aiConfig();
  const apiKey = ai.apiKey;
  if (!apiKey) return res.status(503).json({ error: 'The demo is not available right now.' });

  // 6 / minute and 30 / day per visitor, 400 / day for the whole site.
  if (!(await enforceRateLimit(req, res, 'demo', 6))) return;
  if (!(await enforceRateLimit(req, res, 'demo-day', 30, { windowSeconds: 86_400 }))) return;
  if (!(await enforceRateLimit(req, res, 'demo-all', 400, { windowSeconds: 86_400, global: true }))) return;

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages = raw
    .filter((m): m is { role: string; content: string } =>
      Boolean(m) && typeof m === 'object' &&
      (m as { role?: unknown }).role !== undefined &&
      ['user', 'assistant'].includes(String((m as { role: unknown }).role)) &&
      typeof (m as { content?: unknown }).content === 'string')
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return res.status(400).json({ error: 'Send a question to try the demo.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(ai.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        ...ai.extra,
        messages: [{ role: 'system', content: DEMO_PROMPT }, ...messages],
        temperature: 0.5,
        max_tokens: 160,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return res.status(502).json({ error: 'The demo assistant is unavailable right now.' });
    const data = await response.json();
    const reply = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!reply) return res.status(502).json({ error: 'The demo assistant is unavailable right now.' });
    return res.status(200).json({ reply });
  } catch {
    return res.status(502).json({ error: 'The demo assistant is unavailable right now.' });
  } finally {
    clearTimeout(timer);
  }
}
