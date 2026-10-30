// Service-role client + bearer-token authentication.
// The service-role key lives ONLY in Vercel environment variables.
// Never import this module in browser code.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  cached ??= createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Verifies the Supabase access token; only email-verified users pass. */
export async function userFromRequest(
  req: VercelRequest,
): Promise<AuthedUser | null> {
  const admin = adminClient();
  if (!admin) return null;

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user || !data.user.email_confirmed_at) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}
