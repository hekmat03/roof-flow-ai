/**
 * /api/widget-reply — OPTIONAL live-AI reply for the embeddable widget.
 * ---------------------------------------------------------------------------
 * If GROQ_API_KEY exists in the server environment we proxy Groq
 * (llama-3.3-70b-versatile) to produce the next conversational line; otherwise
 * we return { fallback: true } and widget.html runs its built-in scripted flow.
 * The key is read server-side only and is never echoed back. Message content is
 * NEVER logged (it is visitor PII).
 *
 * SPEND PROTECTION: this endpoint is public and every real reply costs money, so
 * the paid call only happens after authorizeWidgetAi() passes (real contractor
 * key + per-IP, per-company and global daily caps, all stored in the database,
 * failing closed). Anything that is refused simply gets { fallback: true } and
 * the widget carries on with its free scripted questions.
 *
 * Kept as plain Request → Response so it can be tested offline
 * (tests/widget-spend.check.ts).
 */
import { CORS_HEADERS, clean, clientIp, json } from "./leads-core";
import { sessionFromRequest } from "./auth";
import { authorizeWidgetAi } from "./spend-guard";
import {
  consumeConversation,
  quotaExceededResponse,
  releaseConversation,
  usageStorageMissingResponse,
} from "./usage";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 10_000;
const MAX_TURNS = 12;
/** A real widget request is a few hundred bytes. Anything huge is abuse. */
const MAX_BODY_CHARS = 20_000;

const SYSTEM_PROMPT = `You are the friendly website assistant for a roofing contractor.
You help homeowners describe roof problems and get a free inspection booked.
Rules:
- Reply in ONE short sentence (max 25 words). No lists, no markdown.
- Ask at most one question at a time, in this order: what's happening with the roof,
  then their ZIP code, then their name, then the best phone or email.
- Never quote prices. Never promise outcomes. Never ask for payment or insurance details.
- If the visitor is upset, be calm and reassuring.`;

export const handleWidgetReplyOptions = (): Response =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const handleWidgetReplyPost = async (request: Request): Promise<Response> => {
  // Body first: the conversation id travels in it, and the quota must be
  // decided before any work (or any upstream call) happens.
  let body: { messages?: unknown; conversationId?: unknown; widget_key?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return json({ fallback: true, error: "too_large" }, 413);
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({ fallback: true, error: "bad_json" }, 400);
  }

  // One conversation = one server-verified chat thread. The id is issued by
  // this server whenever the caller does not supply a well-formed one, and
  // it is unique per thread, so replaying it is free and can never be
  // counted twice.
  const rawId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const conversationId = /^[A-Za-z0-9_-]{8,128}$/.test(rawId) ? rawId : crypto.randomUUID();

  const key = process.env.GROQ_API_KEY;
  const session = sessionFromRequest(request);
  let usage: Record<string, unknown> | null = null;
  let charged = false;

  if (session) {
    const consume = await consumeConversation({ userId: session.userId, conversationId });
    if (!consume.allowed) {
      if (consume.storage === "ok") {
        return json({ ...quotaExceededResponse(consume.plan, consume.limit), conversationId }, 402);
      }
      return json({ ...usageStorageMissingResponse(), conversationId }, 503);
    }
    charged = consume.counted;
    usage = {
      used: consume.used,
      limit: consume.limit,
      remaining: consume.remaining,
      duplicate: consume.duplicate,
    };
  }

  // The thread is only billed once this server has actually answered it.
  // Every failing path below hands the charge back, so a failed request
  // never counts.
  const release = async (): Promise<void> => {
    if (charged && session) await releaseConversation(session.userId, conversationId);
  };
  const done = (payload: Record<string, unknown>): Response =>
    json({ ...payload, conversationId, ...(usage ? { usage } : {}) });

  // No key configured → the server still answers the thread with its
  // deterministic flow, so the conversation is served and counts.
  if (!key) return done({ fallback: true });

  const messages = Array.isArray(body.messages)
    ? body.messages
        .slice(-MAX_TURNS)
        .map((m) => {
          const turn = (m ?? {}) as Record<string, unknown>;
          const role = turn.role === "assistant" ? "assistant" : "user";
          return { role, content: clean(turn.content, 1000) };
        })
        .filter((m) => m.content.length > 0)
    : [];
  if (messages.length === 0) {
    await release();
    return json({ fallback: true, error: "no_messages", conversationId }, 400);
  }

  // ---- THE SPEND LOCK: nothing below this line costs money until it passes. ----
  const gate = await authorizeWidgetAi(clientIp(request), body.widget_key);
  if (!gate.allowed) {
    await release();
    if (gate.status !== 200) console.warn("[widget-reply] blocked", gate.reason);
    return json(
      {
        fallback: true,
        error: gate.status === 429 ? "rate_limited" : gate.status === 503 ? "unavailable" : undefined,
        conversationId,
      },
      gate.status,
      gate.retryAfterSec ? { "Retry-After": String(Math.min(gate.retryAfterSec, 3600)) } : {}
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 120,
        temperature: 0.6,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Status only — never the body, which can echo the prompt.
      console.warn("[widget-reply] groq non-2xx", res.status);
      await release();
      return done({ fallback: true });
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = clean(data.choices?.[0]?.message?.content, 400);
    if (!reply) {
      await release();
      return done({ fallback: true });
    }
    return done({ fallback: false, reply });
  } catch {
    console.warn("[widget-reply] groq unreachable");
    await release();
    return done({ fallback: true });
  } finally {
    clearTimeout(timer);
  }
};
