
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, userFromRequest } from '../_lib/supabaseAdmin.js';
import { effectivePlan, getProfile } from '../_lib/billing.js';
import { checkoutUrlForPlan, isPlanId, paymentsActivated } from '../_lib/plans.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const admin = adminClient();
  const user = admin ? await userFromRequest(req) : null;
  if (!admin || !user) return res.status(401).json({ ok: false, message: 'Please log in first.' });

  if (!paymentsActivated()) {
    return res.status(200).json({ ok: false, paymentsActivated: false, message: 'Payments are not set up yet.' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const plan = body.plan;
  if (!isPlanId(plan) || plan === 'free') {
    return res.status(400).json({ ok: false, message: 'Choose the Starter or Pro plan.' });
  }

  const profile = await getProfile(admin, user.id);
  const current = effectivePlan(profile);

  if (current !== 'free') {
    return res.status(200).json({
      ok: false,
      paymentsActivated: true,
      message: current === plan
        ? `You are already on the ${current} plan.`
        : 'You already have a subscription. Use "Manage billing" to change plans.',
    });
  }

  const base = checkoutUrlForPlan(plan);
  if (!base) return res.status(200).json({ ok: false, message: 'That plan is not available yet.' });

  const url = new URL(base);
  if (user.email) url.searchParams.set('checkout[email]', user.email);
  url.searchParams.set('checkout[custom][user_id]', user.id);

  return res.status(200).json({ ok: true, paymentsActivated: true, url: url.toString() });
}
