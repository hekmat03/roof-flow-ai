/**
 * agentService.ts
 * ----------------------------------------------------------------------------
 * Public async wrapper around the local dynamic-AI generator
 * (src/utils/aiResponseGenerator.ts).
 *
 * Keeps the exact same API surface the agent components already use
 * (`getAgentResponse(agentType, messages, context)`) but removes the
 * dependency on the external /api/agent-response serverless endpoint and its
 * MISTRAL_API_KEY, which cannot work in a static/local demo. Replies are now
 * generated deterministically in-browser and are fully settings-aware
 * (companyName, city, stormName/stormEvent, stormDate, financingOptions,
 * agentTone).
 *
 * A small bounded delay mimics natural typing so the UIs' "typing" indicators
 * behave realistically. It is capped (~450–1,150 ms) so no UI ever hangs.
 * ----------------------------------------------------------------------------
 */

import {
  generateAgentReply,
  type AgentType,
  type AgentMessage,
  type AgentContext,
  type Intent,
} from '../utils/aiResponseGenerator';

export type { AgentType, AgentMessage, AgentContext, Intent };

export { detectIntent, detectLatestIntent, INTENTS } from '../utils/aiResponseGenerator';

/** Deterministic short delay (bounded) so typing indicators animate naturally. */
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
 * Never throws — falls back to a per-agent generic reply.
 */
export async function getAgentResponse(
  agentType: AgentType,
  messages: AgentMessage[],
  context?: AgentContext
): Promise<string> {
  const ctx: AgentContext = context || {};
  const reply = generateAgentReply(agentType, messages, ctx);
  await boundedLatency(reply);
  return reply;
}