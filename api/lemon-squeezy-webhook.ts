/**
 * POST /api/lemon-squeezy-webhook
 * Lemon Squeezy billing events → tenant plan in Supabase.
 * Stripe is not used. Existing Stripe files are left untouched.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = { api: { bodyParser: false } };

const PLAN_LIMITS: Record<string, number> = { free: 20, starter: 250, pro: 1000 };

function readRaw(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function planFromVariant(variantId: string | null | undefined): 'starter' | 'pro' | null {
  if (!variantId) return null;
  const starter = (process.env.LEMON_SQUEEZY_VARIANT_STARTER ?? '').trim();
  const pro = (process.env.LEMON_SQUEEZY_VARIANT_PRO ?? '').trim();
  if (starter && variantId === starter) return 'starter';
  if (pro && variantId === pro) return 'pro';
  return null;
}

async function admin(path: string, init?: RequestInit) {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('supabase_not_configured');
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
  });
}

async function claim(eventId: string): Promise<boolean> {
  const res = await admin('/rest/v1/webhook_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stripe_event_id: `ls_${eventId}`, lemon_event_id: eventId, processed_at: new Date().toISOString() }),
  });
  if (res.ok) return true;
  if (res.status === 409) return false;
  const text = await res.text();
  if (/duplicate|23505/i.test(text)) return false;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = (process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? '').trim();
  if (!secret) return res.status(503).json({ error: 'lemon_webhook_not_configured' });

  const raw = await readRaw(req);
  const signature = String(req.headers['x-signature'] ?? '');
  const digest = createHmac('sha256', secret).update(raw).digest('hex');
  if (!signature || !safeEqual(digest, signature)) {
    return res.status(400).json({ error: 'invalid_signature' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const eventName = String(meta.event_name ?? '');
  const eventId = String(meta.webhook_id ?? meta.event_id ?? `${eventName}:${Date.now()}`);
  const custom = (meta.custom_data ?? {}) as Record<string, string>;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const attrs = (data.attributes ?? {}) as Record<string, unknown>;
  const variantId = String(attrs.variant_id ?? attrs.product_id ?? '');
  const status = String(attrs.status ?? '');
  const customerId = String(attrs.customer_id ?? '');
  const subscriptionId = String(data.id ?? attrs.subscription_id ?? '');
  const userId = custom.user_id || custom.userId;
  const tenantId = custom.tenant_id || custom.tenantId;

  try {
    const first = await claim(eventId);
    if (!first) return res.status(200).json({ received: true, duplicate: true });
  } catch {
    return res.status(500).json({ error: 'event_store_unavailable' });
  }

  const cancelled = /cancelled|expired|unpaid|paused/i.test(eventName) || /cancelled|expired|unpaid/i.test(status);
  const plan = cancelled ? 'free' : planFromVariant(variantId) ?? (status === 'active' ? 'starter' : 'free');
  const subStatus = cancelled ? 'canceled' : status || 'active';

  const patch = {
    current_plan: plan,
    subscription_status: subStatus,
    lemon_customer_id: customerId || null,
    lemon_subscription_id: subscriptionId || null,
    lemon_variant_id: variantId || null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (tenantId) {
      await admin(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    } else if (userId) {
      const found = await admin(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id`);
      const rows = (await found.json()) as Array<{ tenant_id?: string }>;
      const tid = rows[0]?.tenant_id;
      if (tid) {
        await admin(`/rest/v1/tenants?id=eq.${encodeURIComponent(tid)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      }
      await admin(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ current_plan: plan, subscription_status: subStatus, lemon_customer_id: customerId || null }),
      });
    }
  } catch (err) {
    console.error('lemon webhook apply failed', err);
    return res.status(500).json({ error: 'handler_failed' });
  }

  return res.status(200).json({ received: true, plan, limit: PLAN_LIMITS[plan] ?? 20 });
}
