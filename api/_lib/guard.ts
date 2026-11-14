// Middleware for chat endpoints:
// 1) signed-in, email-verified user  2) per-conversation message cap, enforced
// atomically in the database. There are no plans and no monthly chat limit.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, userFromRequest, type AuthedUser } from './supabaseAdmin.js';
import { MAX_MESSAGES_PER_CONVERSATION, NO_MONTHLY_CHAT_LIMIT } from './limits.js';
import { lookupTenant } from './tenant.js';

export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
export { MAX_MESSAGES_PER_CONVERSATION };

export interface GuardResult {
  user: AuthedUser;
  /** The user's company, resolved server-side. Only set when `requireTenant` was asked for. */
  tenantId: string | null;
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

  const conversationId =
    typeof opts.conversationId === 'string' ? opts.conversationId : '';

  if (!CONVERSATION_ID_RE.test(conversationId)) {
    res.status(400).json({
      error: 'conversationId is required',
      code: 'bad_conversation',
    });
    return null;
  }

  const { data, error } = await admin.rpc('consume_chat', {
    p_user: user.id,
    p_conversation: conversationId,
    p_limit: NO_MONTHLY_CHAT_LIMIT,
    p_max_messages: MAX_MESSAGES_PER_CONVERSATION,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    // Fail closed if the conversation cap cannot be verified.
    console.error('consume_chat failed:', error?.message);
    res.status(503).json({
      error: 'Usage service unavailable, try again shortly',
      code: 'usage_unavailable',
    });
    return null;
  }

  if (!row.allowed) {
    res.status(429).json({
      error: 'This conversation reached its message limit. Start a new chat.',
      code: 'conversation_cap',
    });
    return null;
  }

  return { user, tenantId };
}
