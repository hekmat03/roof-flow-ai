import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceRateLimit } from '../rateLimit.js';
import { adminClient, userFromRequest } from '../supabaseAdmin.js';
import { getProfile } from '../billing.js';
import { normalizeRole } from '../team.js';

async function freshPortalUrl(subscriptionId: string): Promise<string | null> {
  const key = (process.env.LS_API_KEY ?? '').trim();
  if (!key) return null;

  try {
    const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/vnd.api+json' },
    });

    if (!r.ok) return null;

    const d = (await r.json()) as {
      data?: { attributes?: { urls?: { customer_portal?: string } } }
    };

    return d.data?.attributes?.urls?.customer_portal ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  if (!(await enforceRateLimit(req, res, 'billing', 30))) return;
  const admin = adminClient();
  const user = admin ? await userFromRequest(req) : null;
  if (!admin || !user) return res.status(401).json({ ok: false, message: 'Please log in first.' });

  const profile = await getProfile(admin, user.id);
  if (normalizeRole(profile?.role) !== 'owner') {
    return res.status(200).json({ ok: false, message: 'Only the workspace owner can manage billing.' });
  }

  if (!profile?.ls_subscription_id) {
    return res.status(200).json({ ok: false, message: 'There is no subscription to manage yet.' });
  }

  const url = (await freshPortalUrl(profile.ls_subscription_id)) ?? profile.ls_portal_url;

  if (!url) {
    return res.status(200).json({ ok: false, message: 'The billing portal is unavailable right now.' });
  }

  return res.status(200).json({ ok: true, url });
}
