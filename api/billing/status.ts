
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, userFromRequest } from '../_lib/supabaseAdmin.js';
import { statusPayload } from '../_lib/billing.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = adminClient();
    const user = admin ? await userFromRequest(req) : null;
    return res.status(200).json(await statusPayload(admin, user));
  } catch (err) {
    console.error('billing/status error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Could not load billing status' });
  }
}
