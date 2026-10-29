import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminClient } from '../_lib/auth.js';
import {
  encryptRefreshToken,
  exchangeGoogleCode,
  getGoogleEmail,
  redirectApp,
  requestQuery,
  verifyState,
} from '../_lib/google.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const code = requestQuery(req, 'code');
  const stateValue = requestQuery(req, 'state');
  if (requestQuery(req, 'error') || !code || !stateValue) return redirectApp(res, 'error');

  try {
    const state = verifyState(stateValue);
    if (!state) return redirectApp(res, 'error');

    const admin = getAdminClient();
    if (!admin) return redirectApp(res, 'error');

    const tokens = await exchangeGoogleCode(req, code);
    const email = await getGoogleEmail(tokens.access_token!);
    let refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      const { data: current } = await admin.from('calendar_connections')
        .select('encrypted_refresh_token')
        .eq('tenant_id', state.tenantId)
        .maybeSingle();
      if (!current?.encrypted_refresh_token) return redirectApp(res, 'error');
      // Google may omit a refresh token when an account reconnects an existing grant.
      const { decryptRefreshToken } = await import('../_lib/google.js');
      refreshToken = decryptRefreshToken(current.encrypted_refresh_token);
    }

    const { error } = await admin.from('calendar_connections').upsert({
      tenant_id: state.tenantId,
      owner_id: state.userId,
      contractor_email: email,
      encrypted_refresh_token: encryptRefreshToken(refreshToken),
      connected_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
    if (error) throw error;
    return redirectApp(res, 'connected');
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error instanceof Error ? error.message : error);
    return redirectApp(res, 'error');
  }
}
