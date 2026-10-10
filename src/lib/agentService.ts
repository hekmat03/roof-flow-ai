
/**
 * agentService.ts — Central AI response router for all 4 agents.
 * ----------------------------------------------------------------------------
 * Keeps the exact same API surface the agent components already use
 * (`getAgentResponse(agentType, messages, context)`), but now routes replies
 * through a two-tier pipeline:
 *
 *   1. LIVE TIER  — the server endpoint /api/agent-response (Mistral AI).
 *      The provider key lives ONLY in Vercel env vars; the browser sends the
 *      agent type, recent messages and company context, and the server builds
 *      the system prompt (api/_lib/agent.ts).
 *
 *   2. LOCAL TIER — the deterministic in-browser generator
 *      (src/utils/aiResponseGenerator.ts). Used when no key is configured OR
 *      whenever the live call fails (never throws to the UI). A
 *      "roofflow:fallback" event is dispatched by aiService so the UI can show
 *      a small non-intrusive notice.
 *
 * Graceful degradation is a hard requirement: the demo must never break when
 * a key is missing, invalid, or the network is down.
 * ----------------------------------------------------------------------------
 */
import {
  generateAgentReply,
  type AgentType,
  type AgentMessage,
  type AgentContext,
  type Intent,
} from '../utils/aiResponseGenerator';
import { callAgentApi } from '../utils/aiService';

export type { AgentType, AgentMessage, AgentContext, Intent };
export { detectIntent, detectLatestIntent, INTENTS } from '../utils/aiResponseGenerator';

/** Deterministic short delay (bounded) so typing indicators animate naturally on the local path. */
function boundedLatency(seed: string): Promise<void> {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const ms = 450 + (Math.abs(hash) % 700);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate the next agent reply for the given conversation.
 * Tries the live server endpoint first; falls back to the
 * local deterministic generator on any failure. Never throws.
 */
export async function getAgentResponse(
  agentType: AgentType,
  messages: AgentMessage[],
  context?: AgentContext
): Promise<string> {
  const ctx: AgentContext = context || {};

  // ---- Tier 1: live AI via the server endpoint ----
  const live = await callAgentApi({
    agentType,
    // Keep the conversation window bounded — last 6 turns is plenty.
    messages: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
    context: {
      companyName: ctx.companyName,
      city: ctx.city,
      stormEvent: ctx.stormEvent,
      stormDate: ctx.stormDate,
      leadName: ctx.leadName,
      financingOptions: ctx.financingOptions,
      agentTone: ctx.agentTone,
      replyIntent: ctx.replyIntent,
    },
  });
  if (live) return live;
  // live === null → fallback event already dispatched by aiService.

  // ---- Tier 2: local deterministic generator (offline fallback) ----
  const reply = generateAgentReply(agentType, messages, ctx);
  await boundedLatency(reply);
  return reply;
}

