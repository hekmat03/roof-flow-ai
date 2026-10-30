/**
 * agentService.ts — Central AI response router for all 4 agents.
 *
 * LIVE TIER:
 * Uses /api/agent-response. The provider key stays on the server.
 *
 * LOCAL TIER:
 * Uses a deterministic in-browser generator when the live call fails.
 *
 * Graceful degradation is required so the demo continues working when
 * the API key is missing, invalid, or the network is unavailable.
 */

import {
  generateAgentReply,
  type AgentType,
  type AgentMessage,
  type AgentContext,
  type Intent,
} from '../utils/aiResponseGenerator';

import { callAgentApi } from '../utils/aiService';
import { conversationIdFor } from './conversation';

export type { AgentType, AgentMessage, AgentContext, Intent };

export {
  detectIntent,
  detectLatestIntent,
  INTENTS,
} from '../utils/aiResponseGenerator';

/** Deterministic delay so local replies have a natural typing indicator. */
function boundedLatency(seed: string): Promise<void> {
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  const ms = 450 + (Math.abs(hash) % 700);

  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a reply for the specified agent and conversation.
 * Tries the live API first, then falls back to the local generator.
 * Never intentionally throws an error to the UI.
 */
export async function getAgentResponse(
  agentType: AgentType,
  messages: AgentMessage[],
  context?: AgentContext,
  options?: { skipLive?: boolean }
): Promise<string> {
  const ctx: AgentContext = context || {};

  // Tier 1: live AI through the server endpoint.
  const live = options?.skipLive
    ? null
    : await callAgentApi({
        agentType,
        conversationId: conversationIdFor(messages),

        // Keep the conversation window bounded.
        messages: messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content,
        })),

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

  // Tier 2: local deterministic fallback.
  const reply = generateAgentReply(agentType, messages, ctx);

  await boundedLatency(reply);

  return reply;
}
