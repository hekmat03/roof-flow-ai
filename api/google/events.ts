import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/auth.js';
import {
  createGoogleCalendarEvent,
  decryptRefreshToken,
  getCalendarConnection,
  refreshGoogleAccessToken,
} from '../_lib/google.js';
import { isRateLimited } from '../_lib/rateLimit.js';
import { validateContactEmail, validateContactPhone } from '../../src/lib/contactValidation.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (await isRateLimited(req)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    const auth = await authenticateRequest(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const issue = typeof body.issue === 'string' ? body.issue.trim() : '';
    const zip = typeof body.zip === 'string' ? body.zip.trim() : '';
    const startsAt = typeof body.startsAt === 'string' ? body.startsAt : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

    if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Enter a valid homeowner name.' });
    const phoneError = validateContactPhone(phone);
    if (phoneError) return res.status(400).json({ error: phoneError });
    const emailError = validateContactEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });
    if (!issue || issue.length > 1000) return res.status(400).json({ error: 'Describe the roof concern before booking.' });
    if (!Number.isFinite(new Date(startsAt).getTime()) || new Date(startsAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Choose a future date and time for the inspection.' });
    }

    const connection = await getCalendarConnection(auth.profile.tenantId);
    if (!connection) {
      return res.status(409).json({ error: 'Connect Google Calendar in your workspace before booking an inspection.' });
    }
    const refreshToken = decryptRefreshToken(connection.encrypted_refresh_token);
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const event = await createGoogleCalendarEvent(accessToken, connection.contractor_email, {
      name,
      phone,
      email,
      issue,
      zip,
      startsAt,
      notes,
    });
    return res.status(201).json({ ok: true, eventId: event.id, htmlLink: event.htmlLink });
  } catch (error) {
    console.error('Google Calendar event error:', error instanceof Error ? error.message : error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Google Calendar could not create the inspection event.',
    });
  }
}
