// Middleware for chat endpoints:
// 1) signed-in, email-verified user  2) plan allows the agent
// 3) monthly chat limit enforced atomically in the database.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, userFromRequest, type AuthedUser } from './supabaseAdmin.js';
import { effectivePlan, getProfile } from './billing.js';
import { limitForPlan, type PlanId } from './plans.js';
import { lookupTenant } from './tenant.js';

export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
export const MAX_MESSAGES_PER_CONVERSATION = 60;

export interface GuardResult {
  user: AuthedUser;
  /** The user's company, resolved server-side. Only set when `requireTenant` was asked for. */
  tenantId: string | null;
  plan: PlanId;
  used: number;
  limit: number;
}

export async function guardChat(
  req: VercelRequest,
  res: VercelResponse,
  opts: { agentType: string; conversationId: unknown; requireTenant?: boolean },
): Promise<GuardResult | null> {
  const admin = adminClient();
  if (!admin) {
    res.status(503).json({
      error: 'Accounts are not configured on the server',
      code: 'not_configured',
    });
    return null;
  }

  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Please log in again', code: 'unauthenticated' });
    return null;
  }

  // Endpoints that STORE data (agent tools) must know whose data it is. The
  // tenant comes from the verified user's profile, never from the request body.
  let tenantId: string | null = null;
  if (opts.requireTenant) {
    const t = await lookupTenant(admin, user.id);
    if (t.ok === false) {
      res.status(t.status).json({ error: t.error, code: t.code });
      return null;
    }
    tenantId = t.tenantId;
  }

  const plan = effectivePlan(await getProfile(admin, user.id));

  // Phone automation remains Pro-only. Email follow-up agents are available
  // on Starter and Pro, with sends independently capped in plans.ts.
  if (opts.agentType === 'phone' && plan !== 'pro') {
    res.status(403).json({
      error: 'This agent requires the Pro plan',
      code: 'upgrade_required',
      plan,
      requiredPlan: 'pro',
    });
    return null;
  }

  const conversationId =
    typeof opts.conversationId === 'string' ? opts.conversationId : '';

  if (!CONVERSATION_ID_RE.test(conversationId)) {
    res.status(400).json({
      error: 'conversationId is required',
      code: 'bad_conversation',
    });
    return null;
  }

  const limit = limitForPlan(plan);
  const { data, error } = await admin.rpc('consume_chat', {
    p_user: user.id,
    p_conversation: conversationId,
    p_limit: limit,
    p_max_messages: MAX_MESSAGES_PER_CONVERSATION,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    // Fail closed if usage cannot be verified.
    console.error('consume_chat failed:', error?.message);
    res.status(503).json({
      error: 'Usage service unavailable, try again shortly',
      code: 'usage_unavailable',
    });
    return null;
  }

  if (!row.allowed) {
    res.status(402).json({
      error: row.reason === 'conversation_cap'
        ? 'This conversation reached its message limit. Start a new chat.'
        : `You have used all ${limit} chats on the ${plan} plan this month.`,
      code: row.reason === 'conversation_cap' ? 'conversation_cap' : 'limit_reached',
      plan,
      used: row.used,
      limit,
    });
    return null;
  }

  return { user, tenantId, plan, used: row.used, limit };
}
