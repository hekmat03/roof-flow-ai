/**
 * agentRunner.ts — runs an agent turn WITH tools via /api/agent-run.
 * Falls back to the offline engine (no tools, no actions) on any failure,
 * so the app never breaks when the server, AI key or network is unavailable.
 */
import { getAgentResponse, type AgentType, type AgentMessage, type AgentContext } from './agentService';
import type { AgentAction } from './applyActions';
import { supabase } from './supabase';

export const AGENT_RUN_ENDPOINT = '/api/agent-run';
const TIMEOUT_MS = 25000;

export interface AgentRunResult {
  reply: string;
  actions: AgentAction[];
  live: boolean;
}

/** Ephemeral id for one in-memory chat; it is never persisted in the browser. */
const chatSessionId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  .replace(/[^A-Za-z0-9_-]/g, '');

export function getSessionId(): string {
  return chatSessionId;
}

export async function runAgentWithTools(
  agentType: AgentType,
  messages: AgentMessage[],
  ctx: AgentContext = {}
): Promise<AgentRunResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data: { session } } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    if (!session?.access_token) throw new Error('A verified account is required to use chat tools.');
    const res = await fetch(AGENT_RUN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        agentType,
        sessionId: getSessionId(),
        messages: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
        context: ctx,
      }),
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.reply === 'string' && data.reply.trim()) {
        return { reply: data.reply.trim(), actions: Array.isArray(data.actions) ? data.actions : [], live: true };
      }
    }
  } catch {
    /* fall through to offline engine */
  } finally {
    clearTimeout(timer);
  }
  try { window.dispatchEvent(new CustomEvent('roofflow:fallback')); } catch { /* best-effort */ }
  const reply = await getAgentResponse(agentType, messages, ctx, { skipLive: true });
  return { reply, actions: [], live: false };
}
