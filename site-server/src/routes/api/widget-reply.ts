/**
 * /api/widget-reply — OPTIONAL live-AI reply for the embeddable widget.
 * ---------------------------------------------------------------------------
 * If GROQ_API_KEY exists in the server environment we proxy Groq
 * (llama-3.3-70b-versatile) to produce the next conversational line; otherwise
 * we return { fallback: true } and widget.html runs its built-in scripted flow.
 * The key is read server-side only and is never echoed back. Message content is
 * NEVER logged (it is visitor PII).
 */
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, clean, clientIp, json, rateLimit } from "../../lib/leads-core";
import { sessionFromRequest } from "../../lib/auth";
import {
  consumeConversation,
  quotaExceededResponse,
  releaseConversation,
  usageStorageMissingResponse,
} from "../../lib/usage";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 10_000;
const MAX_TURNS = 12;

const SYSTEM_PROMPT = `You are the friendly website assistant for a roofing contractor.
You help homeowners describe roof problems and get a free inspection booked.
Rules:
- Reply in ONE short sentence (max 25 words). No lists, no markdown.
- Ask at most one question at a time, in this order: what's happening with the roof,
  then their ZIP code, then their name, then the best phone or email.
- Never quote prices. Never promise outcomes. Never ask for payment or insurance details.
- If the visitor is upset, be calm and reassuring.`;

const rateLimited = (retryAfterSec: number): Response =>
  json({ fallback: true, error: "rate_limited", retryAfterSec }, 429, {
    "Retry-After": String(retryAfterSec),
  });

export const Route = createFileRoute("/api/widget-reply")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        // Body first: the conversation id travels in it, and the quota must be
        // decided before any work (or any upstream call) happens.
        let body: { messages?: unknown; conversationId?: unknown };
        try {
          body = (await request.json()) as { messages?: unknown; conversationId?: unknown };
        } catch {
          return json({ fallback: true, error: "bad_json" }, 400);
        }

        const limit = rateLimit(`ai:${clientIp(request)}`);
        if (!limit.allowed) return rateLimited(limit.retryAfterSec);

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
      },
    },
  },
});
