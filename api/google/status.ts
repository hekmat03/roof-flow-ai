import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/auth.js';
import { googleConfig, getCalendarConnection } from '../_lib/google.js';
import { enforceRateLimit } from '../_lib/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, 'google', 30))) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    const connection = await getCalendarConnection(auth.profile.tenantId);
    const { clientId, clientSecret } = googleConfig();
    return res.status(200).json({
      configured: Boolean(clientId && clientSecret),
      connected: Boolean(connection),
      email: connection?.contractor_email ?? null,
    });
  } catch (error) {
    console.error('Google Calendar status error:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Calendar status is temporarily unavailable.' });
  }
}
