export const AGENT_API_ENDPOINT = '/api/agent-response';
export const REQUEST_TIMEOUT_MS = 15000;

export type ApiAgentType = 'chatbot' | 'phone' | 'nurturer' | 'closer';

export interface AgentApiRequest {
  agentType: ApiAgentType;
  messages: { role: 'user' | 'assistant'; content: string }[];
  context?: Record<string, string | undefined>;
}

export interface AiStatus {
  live: boolean;
  provider?: string;
  model?: string;
}

function notifyFallback(): void {
  try {
    window.dispatchEvent(new CustomEvent('roofflow:fallback'));
  } catch {
    /* best-effort */
  }
}

/** Ask the server for a reply. Returns null on any failure (never throws). */
export async function callAgentApi(req: AgentApiRequest): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(AGENT_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) {
      notifyFallback();
      return null;
    }
    const data = await res.json();
    const text: unknown = data?.reply;
    if (typeof text !== 'string' || !text.trim()) {
      notifyFallback();
      return null;
    }
    return text.trim();
  } catch {
    notifyFallback();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Is live AI configured on the server? Returns null if the API is unreachable. */
export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch(AGENT_API_ENDPOINT, { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    return { live: Boolean(data?.live), provider: data?.provider, model: data?.model };
  } catch {
    return null;
  }
}

export interface AgentCapabilities extends AiStatus {
  tools?: boolean;
  storage?: boolean;
  email?: boolean;
}

/** What the server can do right now (AI / database / real email). Null if unreachable. */
export async function fetchCapabilities(): Promise<AgentCapabilities | null> {
  try {
    const res = await fetch('/api/agent-run', { method: 'GET' });
    if (!res.ok) return null;
    const d = await res.json();
    return { live: Boolean(d?.live), model: d?.model, tools: Boolean(d?.tools), storage: Boolean(d?.storage), email: Boolean(d?.email) };
  } catch {
    return null;
  }
}
