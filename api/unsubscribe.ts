import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient } from './_lib/supabaseAdmin.js';
import { verifyUnsubscribeToken } from './_lib/email.js';
import { applyUnsubscribe } from './_lib/unsubscribe.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('Method not allowed');
  const secret = process.env.SESSION_SECRET;
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const payload = secret ? verifyUnsubscribeToken(token, secret) : null;
  if (!payload) return res.status(400).send('This unsubscribe link is invalid or expired.');
  const admin = adminClient();
  if (!admin) return res.status(503).send('Unsubscribe service is temporarily unavailable.');
  try {
    await applyUnsubscribe({
      async suppressAndCancel(tenantId, email) {
        const { error } = await admin.rpc('unsubscribe_email', { p_tenant: tenantId, p_email: email });
        if (error) throw error;
      },
    }, payload);
  } catch (error) {
    console.error('unsubscribe failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).send('Unsubscribe service is temporarily unavailable.');
  }
  return res.status(200).send('You have been unsubscribed from this company’s email follow-ups.');
}
