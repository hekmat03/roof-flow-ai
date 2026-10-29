import { createHmac } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { getAdminClient } from './auth.js';
import { rateLimited } from './agent.js';

function requestIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const fromProxy = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return fromProxy || req.socket.remoteAddress || 'unknown';
}

/** Enforces a shared 10-request/minute IP limit when Supabase is configured. */
export async function isRateLimited(req: VercelRequest): Promise<boolean> {
  const ip = requestIp(req);
  if (rateLimited(`local:${ip}`, 10, 60_000)) return true;

  const admin = getAdminClient();
  if (!admin) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required for the shared API rate limiter.');

  const key = createHmac('sha256', secret).update(ip).digest('hex');
  const { data, error } = await admin.rpc('consume_api_rate_limit', {
    p_bucket_key: key,
    p_limit: 10,
    p_window_seconds: 60,
  });
  if (error) throw new Error('API rate-limit storage is unavailable. Apply supabase/auth-crm.sql.');
  return data !== true;
}
