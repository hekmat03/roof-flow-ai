// The ONE place that knows which AI provider the serverless functions call.
// Both providers speak the OpenAI-style /chat/completions format, so switching
// is only a URL + key + model change.
//
// Env vars (Vercel -> Project Settings -> Environment Variables):
//   XAI_API_KEY             required for live AI (xAI Grok, the default)
//   AI_MODEL                optional model override (default: grok-4.3)
//   AI_REASONING_EFFORT     optional: none | low | medium | high | off
//                           (default none = fast, cheap replies; "off" sends nothing)
//   AI_PROVIDER             optional: xai (default) | groq
//   GROQ_API_KEY            only when AI_PROVIDER=groq (GroqCloud)

export type AiProvider = 'xai' | 'groq';

const PROVIDERS: Record<AiProvider, { url: string; keyEnv: string; model: string }> = {
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    keyEnv: 'XAI_API_KEY',
    model: 'grok-4.3',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
  },
};

export interface AiConfig {
  provider: AiProvider;
  url: string;
  apiKey: string | undefined;
  model: string;
  /** Provider-specific request fields; spread these into the JSON body. */
  extra: Record<string, unknown>;
}

export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const provider: AiProvider = (env.AI_PROVIDER ?? '').trim().toLowerCase() === 'groq' ? 'groq' : 'xai';
  const p = PROVIDERS[provider];

  const apiKey = (env[p.keyEnv] ?? '').trim() || undefined;
  const model = (env.AI_MODEL ?? '').trim() || p.model;

  // Reasoning models spend tokens "thinking" before they answer. Our replies are
  // tiny (max_tokens 60-350), so default to no reasoning: faster, cheaper, and
  // the token budget goes to the visible reply.
  const effort = (env.AI_REASONING_EFFORT ?? 'none').trim().toLowerCase();
  const extra: Record<string, unknown> =
    provider === 'xai' && effort !== 'off' && effort !== '' ? { reasoning_effort: effort } : {};

  return { provider, url: p.url, apiKey, model, extra };
}
