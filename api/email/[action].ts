// One Vercel function that serves several routes (the free Hobby plan allows at most 12 functions).
// The route code lives in api/_lib/routes/ (files starting with "_" are not deployed as functions).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import emailConfirm from '../_lib/routes/emailConfirm.js';
import emailUnsubscribe from '../_lib/routes/emailUnsubscribe.js';

type Route = (req: VercelRequest, res: VercelResponse) => unknown;
const ROUTES: Record<string, Route> = {
  confirm: emailConfirm,
  unsubscribe: emailUnsubscribe,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query?.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  const route = typeof action === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : undefined;
  if (!route) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Not found' });
  }
  return route(req, res);
}
