import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/auth.js';
import { googleConfig, googleRedirectUri, GOOGLE_OAUTH_SCOPES, oauthCookie, signState } from '../_lib/google.js';
import { enforceRateLimit } from '../_lib/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, 'google', 20))) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    const { clientId, clientSecret } = googleConfig();
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: 'Google Calendar OAuth is not configured on the server yet.' });
    }

    const nonce = randomBytes(18).toString('base64url');
    const state = signState({
      userId: auth.user.id,
      tenantId: auth.profile.tenantId,
      expiresAt: Date.now() + 10 * 60_000,
      nonce,
    });
    const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleRedirectUri(req),
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();

    // Binds this flow to THIS browser (CSRF protection, checked in callback.ts).
    res.setHeader('Set-Cookie', oauthCookie(nonce));
    return res.status(200).json({ url: authorizeUrl.toString() });
  } catch (error) {
    console.error('Google Calendar connect error:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Google Calendar could not be connected right now.' });
  }
}
