// GET  /api/confirm-email?token=…  shows a page with a "Confirm" button (no state change,
//      so mail scanners that prefetch links cannot confirm an address by accident).
// POST /api/confirm-email?token=…  marks the lead's email as verified.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient } from './_lib/supabaseAdmin.js';
import { escapeHtml, verifyLeadConfirmToken } from './_lib/email.js';
import { confirmLeadEmail, type ConfirmLeadStore } from './_lib/emailConfirm.js';
import { enforceRateLimit } from './_lib/rateLimit.js';

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">` +
  `<title>${escapeHtml(title)}</title><style>` +
  `body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0}` +
  `main{max-width:420px;margin:12vh auto;padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(2,6,23,.1)}` +
  `button{background:#f59e0b;border:0;border-radius:8px;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer}` +
  `</style></head><body><main><h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}</main></body></html>`;

function send(res: VercelResponse, status: number, html: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  return res.status(status).send(html);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method not allowed');
  }
  if (!(await enforceRateLimit(req, res, 'confirm-email', 20))) return;

  const secret = process.env.SESSION_SECRET;
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const invalid = () => send(res, 400, page('Link not valid', '<p>This confirmation link is invalid or has expired.</p>'));

  if (req.method === 'GET') {
    if (!secret || !verifyLeadConfirmToken(token, secret)) return invalid();
    return send(res, 200, page('Confirm your email',
      `<p>Press the button to confirm this email address.</p>` +
      `<form method="POST" action="/api/confirm-email?token=${escapeHtml(encodeURIComponent(token))}"><button type="submit">Confirm my email</button></form>`));
  }

  const admin = adminClient();
  if (!admin) return send(res, 503, page('Unavailable', '<p>Please try again later.</p>'));

  const store: ConfirmLeadStore = {
    async getLead(leadId, tenantId) {
      const { data, error } = await admin.from('leads').select('email,email_verified_at')
        .eq('id', leadId).eq('tenant_id', tenantId).maybeSingle();
      if (error) throw error;
      return data ? { email: typeof data.email === 'string' ? data.email : null, email_verified_at: typeof data.email_verified_at === 'string' ? data.email_verified_at : null } : null;
    },
    async markVerified(leadId, tenantId, email) {
      const { error } = await admin.from('leads').update({ email_verified_at: new Date().toISOString() })
        .eq('id', leadId).eq('tenant_id', tenantId).eq('email', email).is('email_verified_at', null);
      if (error) throw error;
    },
  };

  try {
    const outcome = await confirmLeadEmail(store, token, secret);
    if (outcome === 'invalid') return invalid();
    return send(res, 200, page('Email confirmed', '<p>Thank you. Your email address is confirmed and you can close this page.</p>'));
  } catch (error) {
    console.error('confirm-email failed:', error instanceof Error ? error.message : 'unknown');
    return send(res, 503, page('Unavailable', '<p>Please try again later.</p>'));
  }
}
