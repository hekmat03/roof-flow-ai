// api/admin-stats.ts — platform-wide numbers for the /admin page.
// Only emails listed in ADMIN_EMAILS get an answer; everyone else gets 403.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { adminClient, userFromRequest } from './_lib/supabaseAdmin.js';
import { isPlatformAdmin } from './_lib/team.js';
import { PLANS } from './_lib/plans.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, 'admin-stats', 30))) return;

  const admin = adminClient();
  if (!admin) return res.status(503).json({ ok: false, error: 'Accounts are not configured on the server.' });
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Please log in again.' });
  if (!isPlatformAdmin(user.email)) return res.status(403).json({ ok: false, error: 'Not allowed.' });

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const head = { count: 'exact' as const, head: true };

    const [users, disabled, newUsers, tenants, leads, newLeads, profiles] = await Promise.all([
      admin.from('profiles').select('user_id', head),
      admin.from('profiles').select('user_id', head).eq('disabled', true),
      admin.from('profiles').select('user_id', head).gte('created_at', since),
      admin.from('tenants').select('id', head),
      admin.from('leads').select('id', head),
      admin.from('leads').select('id', head).gte('created_at', since),
      admin.from('profiles').select('current_plan,subscription_status').limit(5000),
    ]);
    if (users.error) throw users.error;

    const PAYING = ['active', 'on_trial', 'past_due'];
    const byPlan: Record<string, number> = {};
    let mrr = 0;
    let paying = 0;
    for (const row of profiles.data ?? []) {
      const plan = typeof row.current_plan === 'string' ? row.current_plan : 'free';
      byPlan[plan] = (byPlan[plan] ?? 0) + 1;
      if (PAYING.includes(String(row.subscription_status ?? '')) && plan !== 'free') {
        paying += 1;
        mrr += PLANS[plan as keyof typeof PLANS]?.priceMonthlyUsd ?? 0;
      }
    }

    return res.status(200).json({
      ok: true,
      stats: {
        users: users.count ?? 0,
        disabledUsers: disabled.count ?? 0,
        newUsers7d: newUsers.count ?? 0,
        workspaces: tenants.count ?? 0,
        leads: leads.count ?? 0,
        leads7d: newLeads.count ?? 0,
        byPlan,
        payingCustomers: paying,
        mrrUsd: mrr,
      },
    });
  } catch (err) {
    console.error('admin-stats error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
