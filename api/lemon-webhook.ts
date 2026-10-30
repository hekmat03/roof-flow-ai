
 // api/lemon-webhook.ts — Lemon Squeezy webhook: keeps profiles.current_plan in sync.
 // Lemon Squeezy dashboard -> Settings -> Webhooks:
 //   URL:    https://YOUR-DOMAIN/api/lemon-webhook
 //   Secret: same value as LS_WEBHOOK_SECRET
 //   Events: subscription_created, subscription_updated, subscription_cancelled,
 //           subscription_resumed, subscription_expired, subscription_paused,
 //           subscription_unpaused, subscription_payment_failed
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient } from './_lib/supabaseAdmin.js';
import { planFromVariant, type PlanId } from './_lib/plans.js';

export const config = { api: { bodyParser: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readRaw(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : (c as Buffer));
  return Buffer.concat(chunks);
}

function validSignature(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  let given: Buffer;
  try { given = Buffer.from(header, 'hex'); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function entitlement(a: Record<string, unknown>): PlanId | 'unmapped' {
  const status = String(a.status ?? '');
  const variantPlan = planFromVariant(a.variant_id);
  const endsAt = a.ends_at ? Date.parse(String(a.ends_at)) : 0;
  if (['active', 'on_trial', 'past_due'].includes(status)) return variantPlan ?? 'unmapped';
  if (status === 'cancelled') return endsAt > Date.now() ? (variantPlan ?? 'unmapped') : 'free';
  return 'free';
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

  let evt: { meta?: Record<string, any>; data?: { attributes?: Record<string, unknown> } };
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'bad json' }); }

  const eventName = String(evt.meta?.event_name ?? '');
  if (!eventName.startsWith('subscription_') || eventName.startsWith('subscription_payment_')) {
    return res.status(200).json({ ok: true, ignored: eventName });
  }

  const a = evt.data?.attributes ?? {};
  let userId = String(evt.meta?.custom_data?.user_id ?? '');

  if (!UUID_RE.test(userId)) {
    const email = String(a.user_email ?? '').toLowerCase();
    const { data } = email
      ? await admin.from('profiles').select('user_id').eq('email', email).maybeSingle()
      : { data: null };
    userId = (data as { user_id?: string } | null)?.user_id ?? '';
  }

  if (!UUID_RE.test(userId)) return res.status(200).json({ ok: true, ignored: 'no_user' });

  const updatedAt = String(a.updated_at ?? new Date().toISOString());
  const { data: existing } = await admin.from('profiles').select('ls_updated_at').eq('user_id', userId).maybeSingle();
  const prev = (existing as { ls_updated_at?: string | null } | null)?.ls_updated_at;

  if (prev && Date.parse(updatedAt) < Date.parse(prev)) {
    return res.status(200).json({ ok: true, ignored: 'stale' });
  }

  const plan = entitlement(a);
  if (plan === 'unmapped') {
    console.error('lemon-webhook: variant not mapped (check LS_VARIANT_STARTER / LS_VARIANT_PRO):', a.variant_id);
    return res.status(200).json({ ok: true, ignored: 'unmapped_variant' });
  }

  const urls = (a.urls ?? {}) as { customer_portal?: string };
  const { error } = await admin.from('profiles').update({
    current_plan: plan,
    subscription_status: String(a.status ?? 'none'),
    ls_customer_id: a.customer_id != null ? String(a.customer_id) : null,
    ls_subscription_id: evt.data && (evt.data as { id?: string }).id ? String((evt.data as { id?: string }).id) : null,
    ls_variant_id: a.variant_id != null ? String(a.variant_id) : null,
    current_period_end: (a.renews_at ?? a.ends_at ?? null) as string | null,
    cancel_at_period_end: Boolean(a.cancelled),
    ls_portal_url: urls.customer_portal ?? null,
    ls_updated_at: updatedAt,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  if (error) {
    console.error('lemon-webhook db error:', error.message);
    return res.status(500).json({ error: 'db error' });
  }

  return res.status(200).json({ ok: true, plan });
}
