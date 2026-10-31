import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminClient } from './auth.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const USERINFO_SCOPE = 'openid email';

export interface GoogleState {
  userId: string;
  tenantId: string;
  expiresAt: number;
  nonce: string;
}

export function requestQuery(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}

export function googleRedirectUri(req: VercelRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000';
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || 'http';
  return `${proto}://${Array.isArray(host) ? host[0] : host}/api/google/callback`;
}

export function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

function stateSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required for Google OAuth state signing.');
  return secret;
}

export function signState(state: GoogleState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyState(value: string): GoogleState | null {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', stateSecret()).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleState;
    if (!state.userId || !state.tenantId || !state.nonce || state.expiresAt < Date.now()) return null;
    return state;
  } catch {
    return null;
  }
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(stateSecret()).digest();
}

export function encryptRefreshToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptRefreshToken(value: string): string {
  const [version, iv, ciphertext, tag] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext || !tag) throw new Error('Stored Google Calendar credentials are invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function redirectApp(res: VercelResponse, status: 'connected' | 'error'): void {
  const appUrl = process.env.APP_BASE_URL;
  const base = appUrl ? new URL('/app', appUrl).toString() : '/app';
  const target = `${base}?calendar=${status}`;
  res.setHeader('Location', target);
  res.status(302).end();
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) throw new Error('Google Calendar OAuth is not configured.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error || 'Google Calendar authorization expired. Reconnect your calendar.');
  return data.access_token;
}

export async function getCalendarConnection(tenantId: string) {
  const admin = getAdminClient();
  if (!admin) throw new Error('Supabase server access is not configured.');
  const { data, error } = await admin
    .from('calendar_connections')
    .select('contractor_email, encrypted_refresh_token')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error('Google Calendar connection could not be loaded.');
  return data;
}

export async function exchangeGoogleCode(req: VercelRequest, code: string) {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) throw new Error('Google Calendar OAuth is not configured.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error || 'Google did not authorize the calendar connection.');
  return data;
}

export async function getGoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json() as { email?: string; email_verified?: boolean };
  if (!response.ok || !data.email || !data.email_verified) throw new Error('Could not verify the Google account email.');
  return data.email;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  contractorEmail: string,
  details: {
    name: string;
    phone: string;
    email: string;
    issue: string;
    zip?: string;
    startsAt: string;
    notes?: string;
  },
) {
  const start = new Date(details.startsAt);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
    throw new Error('Choose a future date and time for the inspection.');
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const response = await fetch(`${GOOGLE_CALENDAR_URL}?sendUpdates=all`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `Roof inspection request — ${details.name}`,
      description: [
        `Homeowner: ${details.name}`,
        `Phone: ${details.phone}`,
        `Email: ${details.email}`,
        details.zip ? `ZIP: ${details.zip}` : '',
        `Roof concern: ${details.issue}`,
        details.notes ? `Notes: ${details.notes}` : '',
        'Created through RoofFlow AI.',
      ].filter(Boolean).join('\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: [{ email: contractorEmail }, { email: details.email }],
      reminders: {
        useDefault: false,
        overrides: [{ method: 'email', minutes: 1440 }],
      },
    }),
  });
  const data = await response.json() as { id?: string; htmlLink?: string; error?: { message?: string } };
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || 'Google Calendar could not create the inspection event.');
  }
  return { id: data.id, htmlLink: data.htmlLink ?? null };
}

export const GOOGLE_OAUTH_SCOPES = `${CALENDAR_SCOPE} ${USERINFO_SCOPE}`;
