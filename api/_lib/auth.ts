import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

export function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticateRequest(req: VercelRequest) {
  const authorization = req.headers.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (!token) return { ok: false as const, status: 401, error: 'Sign in to continue.' };

  const admin = getAdminClient();
  if (!admin) return { ok: false as const, status: 503, error: 'Supabase server access is not configured.' };

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
    console.error('Could not load authenticated workspace profile:', profileError.message);
    return { ok: false as const, status: 503, error: 'Your workspace profile is unavailable.' };
  }
  if (!profile?.tenant_id) {
    return { ok: false as const, status: 403, error: 'Your workspace has not been created yet.' };
  }

  return { ok: true as const, admin, user, profile: { tenantId: profile.tenant_id as string, email: profile.email as string | null } };
}
