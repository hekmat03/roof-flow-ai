// api/lemon-webhook.ts — Lemon Squeezy webhook: keeps profiles.current_plan in sync.
// Lemon Squeezy dashboard -> Settings -> Webhooks:
//   URL:    https://YOUR-DOMAIN/api/lemon-webhook
//   Secret: same value as LS_WEBHOOK_SECRET
//   Events: subscription_created, subscription_updated, subscription_cancelled,
//           subscription_resumed, subscription_expired, subscription_paused,
//           subscription_unpaused
//   (subscription_payment_* events are acknowledged and ignored: failed and recovered
//    payments already arrive as subscription_updated with status past_due / active.)
// The logic lives in _lib/lemon.ts so it can be tested without a network.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient } from './_lib/supabaseAdmin.js';
import { applyLemonEvent, validSignature, type LemonEvent } from './_lib/lemon.js';

export const config = { api: { bodyParser: false } };

async function readRaw(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : (c as Buffer));
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = (process.env.LS_WEBHOOK_SECRET ?? '').trim();
  const admin = adminClient();
  if (!secret || !admin) return res.status(503).json({ error: 'not configured' });

  const raw = await readRaw(req);
  const sig = req.headers['x-signature'];
  if (!validSignature(raw, Array.isArray(sig) ? sig[0] : sig, secret)) {
    return res.status(401).json({ error: 'bad signature' });
  }

  let evt: LemonEvent;
  try {
    evt = JSON.parse(raw.toString('utf8')) as LemonEvent;
  } catch {
    return res.status(400).json({ error: 'bad json' });
  }

  const result = await applyLemonEvent(admin, evt);
  return res.status(result.status).json(result.body);
}
