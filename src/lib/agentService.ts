export type AgentType = 'chatbot' | 'phone' | 'nurturer' | 'closer';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentContext {
  companyName?: string;
  city?: string;
  stormEvent?: string;
  stormDate?: string;
  leadName?: string;
}

export async function getAgentResponse(
  agentType: AgentType,
  messages: AgentMessage[],
  context?: AgentContext
): Promise<string> {
  const res = await fetch('/api/agent-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentType, messages, context }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Agent request failed (${res.status})`);
  }

  const data = await res.json();
  return data.reply as string;
}
