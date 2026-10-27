/**
 * GET /api/google-calendar-callback — OAuth redirect from Google.
 * Stores the refresh token on the contractor's tenant row (service role).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  const origin = `${req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https'}://${req.headers.host}`;
  if (!code || !state) {
    return res.redirect(302, `${origin}/app?calendar=denied`);
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const redirect = (process.env.GOOGLE_REDIRECT_URI ?? '').trim() || `${origin}/api/google-calendar-callback`;
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) {
    return res.redirect(302, `${origin}/app?calendar=not_configured`);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return res.redirect(302, `${origin}/app?calendar=token_failed`);
  const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string };
  if (!tokens.refresh_token) return res.redirect(302, `${origin}/app?calendar=no_refresh`);

  let email = '';
  if (tokens.access_token) {
    const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (info.ok) {
      const json = (await info.json()) as { email?: string };
      email = json.email ?? '';
    }
  }

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(state)}&select=tenant_id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const profiles = (await profileRes.json()) as Array<{ tenant_id?: string }>;
  const tenantId = profiles[0]?.tenant_id;
  if (!tenantId) return res.redirect(302, `${origin}/app?calendar=no_tenant`);

  await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      google_refresh_token: tokens.refresh_token,
      google_calendar_email: email || null,
      updated_at: new Date().toISOString(),
    }),
  });

  return res.redirect(302, `${origin}/app?calendar=connected`);
}
