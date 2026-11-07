// api/_lib/rateLimit.ts — per-IP rate limit shared by every API route.
// Counts live in Postgres (consume_rate_limit, see supabase/003_ratelimit.sql) so the
// limit holds across serverless instances. If the database is unreachable it
// falls back to the in-memory limiter, so a database outage never opens the door.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient } from './supabaseAdmin.js';
import { rateLimited } from './agent.js';

export const RATE_LIMIT_PER_MINUTE = 10;
/** Extracts the allow decision from Supabase's table-valued RPC response. */
export function rateLimitRpcAllowed(data: unknown, error: unknown): boolean | null {
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('allowed' in row)) return null;
  const allowed = (row as { allowed?: unknown }).allowed;
  return typeof allowed === 'boolean' ? allowed : null;
}

export function clientIp(req: VercelRequest): string {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  return pick(req.headers['x-real-ip']) || pick(req.headers['x-forwarded-for']) || 'unknown';
}

/** Returns true when the request may continue. Otherwise it has already answered 429. */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  name: string,
  max: number = RATE_LIMIT_PER_MINUTE,
  opts: { windowSeconds?: number; global?: boolean } = {},
): Promise<boolean> {
  const windowSeconds = opts.windowSeconds ?? 60;
  // global: one shared counter for everybody (caps total spend on a public endpoint)
  const key = opts.global ? `${name}:*` : `${name}:${clientIp(req)}`;
  let allowed: boolean | null = null;

  const admin = adminClient();
  if (admin) {
    try {
      const { data, error } = await admin.rpc('consume_rate_limit', { p_key: key, p_limit: max, p_window_seconds: windowSeconds });
      const rpcAllowed = rateLimitRpcAllowed(data, error);
      if (rpcAllowed !== null) allowed = rpcAllowed;
    } catch {
      /* fall through to memory */
    }
  }
  if (allowed === null) allowed = !rateLimited(key, max, windowSeconds * 1000);

  if (!allowed) {
    res.setHeader('Retry-After', String(Math.min(windowSeconds, 3600)));
    res.status(429).json({ error: 'Too many requests. Please wait a bit and try again.', code: 'rate_limited' });
    return false;
  }
  return true;
}
