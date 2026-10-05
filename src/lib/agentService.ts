/**
 * agentService.ts — Central AI response router for all 4 agents.
 * ----------------------------------------------------------------------------
 * Keeps the exact same API surface the agent components already use
 * (`getAgentResponse(agentType, messages, context)`), but now routes replies
 * through a two-tier pipeline:
 *
 *   1. LIVE TIER  — Groq API (src/utils/aiService.ts) when the user has
 *      configured a Groq API key (localStorage "roofflow_groq_key", set in the
 *      Configuration panel). The system prompt is assembled from the agent
 *      personality, the company settings (companyName, city, storm event,
 *      financing, tone) and the forced intent of the current dialogue step.
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
import { callGroq, isGroqConfigured, type AIChatMessage } from '../utils/aiService';

export type { AgentType, AgentMessage, AgentContext, Intent };
export { detectIntent, detectLatestIntent, INTENTS } from '../utils/aiResponseGenerator';

/** Per-agent persona lines blended into the Groq system prompt. */
const AGENT_PERSONAS: Record<AgentType, string> = {
  chatbot:
    'You are the Website Lead Capture Chatbot widget. Qualify the visitor, confirm homeowner status, handle storm-damage questions, and steer toward booking a FREE roof inspection. Capture name/phone/email naturally when offered.',
  phone:
    'You are the Inbound Phone Voice Assistant. Your replies will be SPOKEN aloud via text-to-speech, so keep each reply to one or two short spoken sentences with no markdown, no lists, and no special characters. Qualify storm damage, offer financing when asked, and secure an inspection time.',
  nurturer:
    'You are the SMS/Email Follow-Up & Nurture Agent. Reactivate cold leads. Replies go out as SMS/email — keep them under 2 sentences, conversational, low-pressure but deadline-aware (1-year insurance filing limit).',
  closer:
    'You are the Post-Estimate Follow-Up Agent. You follow up 24h/3d/7d after an estimate was sent. Address insurance delays, budget concerns, financing and competitor price-match objections calmly, and steer toward signing.',
};

/** Human-readable labels for intents, used inside the Groq system prompt. */
const INTENT_LABELS: Partial<Record<Intent, string>> = {
  hail: 'storm/hail damage',
  leak: 'active roof leak',
  insurance: 'insurance claim questions',
  supplement: 'supplement/extra damages',
  finance: 'financing options',
  cost: 'pricing concerns',
  free: 'is-it-really-free questions',
  competitor: 'competitor price-match requests',
  warranty: 'warranty questions',
  renter: 'renter (not the homeowner)',
  owner: 'homeowner confirmation',
  schedule: 'confirming the booked inspection time',
  scheduleask: 'asking for scheduling availability',
  optout: 'opt-out / do-not-contact request',
  urgency: 'urgent storm-deadline motivation',
  yes: 'affirmative reply',
  no: 'negative reply',
  busy: 'busy / call-me-later reply',
  greeting: 'opening greeting',
  thanks: 'thank-you / closing pleasantries',
};

/** Deterministic short delay (bounded) so typing indicators animate naturally on the local path. */
function boundedLatency(seed: string): Promise<void> {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const ms = 450 + (Math.abs(hash) % 700);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Build the Groq system prompt from the agent persona + company context. */
function buildSystemPrompt(agentType: AgentType, ctx: AgentContext): string {
  const parts: string[] = [AGENT_PERSONAS[agentType]];

  parts.push(
    `Company: ${ctx.companyName || 'a roofing contractor'}. Service area: ${ctx.city || 'the local metro'}.` +
      (ctx.stormEvent
        ? ` Active storm event: ${ctx.stormEvent}${ctx.stormDate ? ` (${ctx.stormDate})` : ''}. Reference it naturally where relevant.`
        : '') +
      (ctx.financingOptions ? ` Financing options you may offer: ${ctx.financingOptions}.` : '') +
      (ctx.agentTone ? ` Conversational tone: ${ctx.agentTone}.` : '')
  );

  if (ctx.replyIntent) {
    const label = INTENT_LABELS[ctx.replyIntent] || ctx.replyIntent;
    parts.push(
      `The homeowner's latest reply is best classified as "${label}" — respond to that classification.`
    );
  }

  parts.push(
    'Hard rules: never invent prices or discounts, never pressure or guilt the homeowner, stay honest, and always keep the goal of booking the free inspection in view. Reply with ONLY the message text.'
  );

  return parts.join(' ');
}

/**
 * Generate the next agent reply for the given conversation.
 * Tries the live Groq API first when a key is configured; falls back to the
 * local deterministic generator on any failure. Never throws.
 */
export async function getAgentResponse(
  agentType: AgentType,
  messages: AgentMessage[],
  context?: AgentContext
): Promise<string> {
  const ctx: AgentContext = context || {};

  // ---- Tier 1: live Groq API (only when the user armed it) ----
  if (isGroqConfigured()) {
    const groqMessages: AIChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(agentType, ctx) },
      // Keep the conversation window bounded — last 6 turns is plenty.
      ...messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const live = await callGroq({
      messages: groqMessages,
      // Phone replies get spoken — keep them tight.
      maxTokens: agentType === 'phone' ? 120 : 300,
    });

    if (live) return live;
    // live === null → fallback event already dispatched by aiService.
  }

  // ---- Tier 2: local deterministic generator (offline fallback) ----
  const reply = generateAgentReply(agentType, messages, ctx);
  await boundedLatency(reply);
  return reply;
}
