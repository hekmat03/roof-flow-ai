
import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminClient, authenticateRequest } from '../_lib/auth.js';
import {
  clearOauthCookie,
  decryptRefreshToken,
  encryptRefreshToken,
  exchangeGoogleCode,
  getGoogleEmail,
  nonceMatchesCookie,
  redirectApp,
  requestQuery,
  verifyState,
  googleConfig,
  googleRedirectUri,
  GOOGLE_OAUTH_SCOPES,
  oauthCookie,
  signState,
  createGoogleCalendarEvent,
  getCalendarConnection,
  refreshGoogleAccessToken,
} from '../_lib/google.js';
import { enforceRateLimit } from '../_lib/rateLimit.js';
import { validateEmail, validateName, validatePhone } from '../_lib/validators.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const action = req.query.action;

  switch (action) {
    case 'connect':
      return connect(req, res);
    case 'callback':
      return callback(req, res);
    case 'events':
      return events(req, res);
    case 'status':
      return status(req, res);
    default:
      return res.status(404).json({ error: 'Unknown Google API action' });
  }
}

async function connect(req: VercelRequest, res: VercelResponse) {
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

    res.setHeader('Set-Cookie', oauthCookie(nonce));
    return res.status(200).json({ url: authorizeUrl.toString() });
  } catch (error) {
    console.error('Google Calendar connect error:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Google Calendar could not be connected right now.' });
  }
}

async function callback(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Set-Cookie', clearOauthCookie);
  if (req.method !== 'GET') return res.status(405).end();

  const code = requestQuery(req, 'code');
  const stateValue = requestQuery(req, 'state');
  if (requestQuery(req, 'error') || !code || !stateValue) return redirectApp(res, 'error');

  try {
    const state = verifyState(stateValue);
    if (!state) return redirectApp(res, 'error');
    if (!nonceMatchesCookie(state.nonce, req.headers.cookie)) return redirectApp(res, 'error');

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

async function events(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, 'google', 20))) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const issue = typeof body.issue === 'string' ? body.issue.trim() : '';
    const zip = typeof body.zip === 'string' ? body.zip.trim().slice(0, 20) : '';
    const startsAt = typeof body.startsAt === 'string' ? body.startsAt : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

    const name = validateName(body.name);
    if ('error' in name) return res.status(400).json({ error: name.error });

    const phone = validatePhone(body.phone);
    if ('error' in phone) return res.status(400).json({ error: phone.error });

    const email = validateEmail(body.email);
    if ('error' in email) return res.status(400).json({ error: email.error });

    if (!issue || issue.length > 1000) {
      return res.status(400).json({ error: 'Describe the roof concern before booking.' });
    }

    const start = new Date(startsAt);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Choose a future date and time for the inspection.' });
    }

    const connection = await getCalendarConnection(auth.profile.tenantId);
    if (!connection) {
      return res.status(409).json({ error: 'Connect Google Calendar in your workspace before booking an inspection.' });
    }

    const refreshToken = decryptRefreshToken(connection.encrypted_refresh_token);
    const accessToken = await refreshGoogleAccessToken(refreshToken);

    const event = await createGoogleCalendarEvent(accessToken, connection.contractor_email, {
      name: name.value,
      phone: phone.value.length === 10
        ? `(${phone.value.slice(0, 3)}) ${phone.value.slice(3, 6)}-${phone.value.slice(6)}`
        : `+${phone.value}`,
      email: email.value,
      issue,
      zip,
      startsAt,
      notes,
    });

    return res.status(201).json({ ok: true, eventId: event.id, htmlLink: event.htmlLink });
  } catch (error) {
    console.error('Google Calendar event error:', error instanceof Error ? error.message : error);
    return res.status(502).json({
      error: 'Google Calendar could not create the inspection event. Reconnect your calendar and try again.',
    });
  }
}

async function status(req: VercelRequest, res: VercelResponse) {
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
