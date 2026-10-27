/**
 * Google Calendar OAuth + inspection event create.
 * GET  ?action=connect&access_token=  → redirect to Google
 * POST Authorization: Bearer <supabase jwt> → create event
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

function env() {
  return {
    clientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
    redirect: (process.env.GOOGLE_REDIRECT_URI ?? '').trim() || '',
    supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    anon: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

async function admin(path: string, init?: RequestInit) {
  const { supabaseUrl, serviceKey } = env();
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
  });
}

async function userFromBearer(req: VercelRequest): Promise<{ id: string; email: string } | null> {
  const { supabaseUrl, anon } = env();
  const header = String(req.headers.authorization ?? '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.access_token ?? '');
  if (!token || !supabaseUrl || !anon) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: string; email?: string };
  if (!json.id) return null;
  return { id: json.id, email: json.email ?? '' };
}

async function tenantForUser(userId: string) {
  const res = await admin(
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id`
  );
  const rows = (await res.json()) as Array<{ tenant_id?: string }>;
  const tid = rows[0]?.tenant_id;
  if (!tid) return null;
  const t = await admin(`/rest/v1/tenants?id=eq.${encodeURIComponent(tid)}&select=*`);
  const tenants = (await t.json()) as Array<Record<string, unknown>>;
  return tenants[0] ?? null;
}

function oauthUrl(state: string, origin: string) {
  const { clientId, redirect } = env();
  const redirectUri = redirect || `${origin}/api/google-calendar-callback`;
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

function parseWhen(body: Record<string, unknown>): { start: string; end: string } {
  const details = (body.appointmentDetails ?? {}) as { date?: string; time?: string };
  const scheduled = String(body.scheduledDate ?? '');
  const date = details.date || scheduled.split(' ')[0] || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  let hours = 10;
  let minutes = 0;
  const time = details.time || scheduled.split(' ').slice(1).join(' ') || '10:00 AM';
  const m = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    hours = Number(m[1]);
    minutes = Number(m[2]);
    if (/PM/i.test(m[3] ?? '') && hours < 12) hours += 12;
    if (/AM/i.test(m[3] ?? '') && hours === 12) hours = 0;
  }
  const start = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function refreshAccess(refreshToken: string): Promise<string | null> {
  const { clientId, clientSecret } = env();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { clientId, clientSecret, supabaseUrl, serviceKey } = env();
  if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) {
    return res.status(503).json({ ok: false, error: 'google_not_configured' });
  }

  if (req.method === 'GET') {
    const user = await userFromBearer(req);
    if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
    const origin = `${req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https'}://${req.headers.host}`;
    return res.redirect(302, oauthUrl(user.id, origin));
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await userFromBearer(req);
  if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
  const tenant = await tenantForUser(user.id);
  const refresh = String(tenant?.google_refresh_token ?? '');
  if (!refresh) return res.status(409).json({ ok: false, error: 'calendar_not_connected' });
  const access = await refreshAccess(refresh);
  if (!access) return res.status(502).json({ ok: false, error: 'google_token_failed' });

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const lead = (body.lead ?? {}) as Record<string, string>;
  const { start, end } = parseWhen(body);
  const contractor = String(tenant?.google_calendar_email ?? user.email);
  const attendees: Array<{ email: string }> = [];
  if (contractor) attendees.push({ email: contractor });
  if (lead.email && /@/.test(lead.email) && lead.email !== 'N/A') attendees.push({ email: lead.email });

  const event = {
    summary: `Roof inspection — ${lead.name || 'Homeowner'}`,
    description: [
      `Lead: ${lead.name || ''}`,
      `Phone: ${lead.phone || ''}`,
      `Email: ${lead.email || ''}`,
      `ZIP: ${lead.zipCode || ''}`,
      `Issue: ${lead.roofIssue || ''}`,
      'Booked by RoofFlow AI chatbot.',
    ].join('\n'),
    start: { dateTime: start },
    end: { dateTime: end },
    attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 24 * 60 },
      ],
    },
  };

  const created = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!created.ok) {
    const text = await created.text();
    return res.status(502).json({ ok: false, error: 'event_failed', detail: text.slice(0, 200) });
  }
  const json = (await created.json()) as { htmlLink?: string; id?: string };
  return res.status(200).json({ ok: true, eventId: json.id, htmlLink: json.htmlLink });
}
