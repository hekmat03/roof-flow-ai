// One Vercel function that serves several routes (the free Hobby plan allows at most 12 functions).
// The route code lives in api/_lib/routes/ (files starting with "_" are not deployed as functions).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import billingCheckout from '../_lib/routes/billingCheckout.js';
import billingPortal from '../_lib/routes/billingPortal.js';
import billingStatus from '../_lib/routes/billingStatus.js';

type Route = (req: VercelRequest, res: VercelResponse) => unknown;
const ROUTES: Record<string, Route> = {
  checkout: billingCheckout,
  portal: billingPortal,
  status: billingStatus,
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
