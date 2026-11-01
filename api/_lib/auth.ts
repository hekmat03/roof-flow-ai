import type { VercelRequest } from '@vercel/node';
import { adminClient } from './supabaseAdmin.js';

/** Same service-role client everywhere (see supabaseAdmin.ts). */
export const getAdminClient = adminClient;

/** Verified-email user + their tenant. Used by the Google Calendar routes. */
export async function authenticateRequest(req: VercelRequest) {
  const authorization = req.headers.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!token) return { ok: false as const, status: 401, error: 'Sign in to continue.' };

  const admin = getAdminClient();
  if (!admin) return { ok: false as const, status: 503, error: 'Server access is not configured.' };

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { ok: false as const, status: 401, error: 'Your session is invalid or has expired.' };
  if (!user.email_confirmed_at) {
    return { ok: false as const, status: 403, error: 'Verify your email before using the workspace.' };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('tenant_id,email')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Could not load workspace profile:', profileError.message);
    return { ok: false as const, status: 503, error: 'Your workspace profile is unavailable.' };
  }
  if (!profile?.tenant_id) {
    return { ok: false as const, status: 403, error: 'Your workspace has not been created yet.' };
  }
  return { ok: true as const, admin, user, profile: { tenantId: profile.tenant_id as string, email: profile.email as string | null } };
}
