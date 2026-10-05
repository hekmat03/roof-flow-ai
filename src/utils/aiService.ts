/**
 * aiService.ts — Real Groq API integration (OpenAI-compatible REST via fetch).
 * ----------------------------------------------------------------------------
 * Uses Groq's free-tier inference endpoint directly from the browser. No SDK,
 * no build-time bundling issues — plain fetch to
 *   https://api.groq.com/openai/v1/chat/completions
 *
 * This module is a THIN CLIENT: it knows nothing about RoofFlow's agent
 * personalities. System-prompt construction lives in src/lib/agentService.ts,
 * which decides when to call here and when to use the local deterministic
 * generator instead.
 *
 * Graceful degradation is a HARD requirement:
 *   - No API key configured  -> returns null (caller falls back to the local
 *                               deterministic generator; never throws)
 *   - Network/API failure    -> returns null (same fallback path)
 *   - The key is read from localStorage key "roofflow_groq_key" and is NEVER
 *     logged; only its presence/length is ever exposed.
 *
 * A "roofflow:fallback" CustomEvent fires whenever a call could not complete
 * (no key, HTTP error, timeout, empty reply) so the UI can show a small
 * non-intrusive notice explaining the built-in engine took over.
 * ----------------------------------------------------------------------------
 */

export const GROQ_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_KEY_STORAGE = 'roofflow_groq_key';
export const REQUEST_TIMEOUT_MS = 12000;

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Read the user's Groq key from localStorage. */
export function getGroqApiKey(): string {
  try {
    return (localStorage.getItem(GROQ_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function setGroqApiKey(key: string): void {
  try {
    localStorage.setItem(GROQ_KEY_STORAGE, key.trim());
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function clearGroqApiKey(): void {
  try {
    localStorage.removeItem(GROQ_KEY_STORAGE);
  } catch {
    /* non-fatal */
  }
}

/** True when a non-empty key is stored — i.e. the live API path is armed. */
export function isGroqConfigured(): boolean {
  return getGroqApiKey().length > 0;
}

/** Mask a stored key for display: "gsk_…x7Qf" — never the full value. */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function notifyFallback(): void {
  try {
    window.dispatchEvent(new CustomEvent('roofflow:fallback'));
  } catch {
    /* event dispatch is best-effort */
  }
}

export interface GroqRequest {
  messages: AIChatMessage[];
  /** Optional: max tokens for the reply. */
  maxTokens?: number;
  temperature?: number;
}

/**
 * Call Groq. Returns the reply text, or null when the API is unavailable
 * (no key / network error / non-2xx / timeout). NEVER throws.
 */
export async function callGroq(req: GroqRequest): Promise<string | null> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    notifyFallback();
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 300,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Non-2xx (bad key, rate limit, model retirement…) → fallback path.
      notifyFallback();
      return null;
    }

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      notifyFallback();
      return null;
    }
    return text.trim();
  } catch {
    // Network error / abort → fallback path. Never surface to the UI.
    notifyFallback();
    return null;
  } finally {
    clearTimeout(timer);
  }
}
