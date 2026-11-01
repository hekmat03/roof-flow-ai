import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/auth.js';
import {
  createGoogleCalendarEvent,
  decryptRefreshToken,
  getCalendarConnection,
  refreshGoogleAccessToken,
} from '../_lib/google.js';
import { enforceRateLimit } from '../_lib/rateLimit.js';
import { validateEmail, validateName, validatePhone } from '../_lib/validators.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, 'google', 20))) return;

  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const issue = typeof body.issue === 'string' ? body.issue.trim() : '';
    const zip = typeof body.zip === 'string' ? body.zip.trim().slice(0, 20) : '';
    const startsAt = typeof body.startsAt === 'string' ? body.startsAt : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

    const name = validateName(body.name);
    if (!name.ok) return res.status(400).json({ error: name.error });
    const phone = validatePhone(body.phone);
    if (!phone.ok) return res.status(400).json({ error: phone.error });
    const email = validateEmail(body.email);
    if (!email.ok) return res.status(400).json({ error: email.error });
    if (!issue || issue.length > 1000) return res.status(400).json({ error: 'Describe the roof concern before booking.' });
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
      phone: phone.value.length === 10 ? `(${phone.value.slice(0, 3)}) ${phone.value.slice(3, 6)}-${phone.value.slice(6)}` : `+${phone.value}`,
      email: email.value,
      issue,
      zip,
      startsAt,
      notes,
    });
    return res.status(201).json({ ok: true, eventId: event.id, htmlLink: event.htmlLink });
  } catch (error) {
    console.error('Google Calendar event error:', error instanceof Error ? error.message : error);
    // Never leak internal details; Google's own message is safe to show for expected failures.
    return res.status(502).json({ error: 'Google Calendar could not create the inspection event. Reconnect your calendar and try again.' });
  }
}
