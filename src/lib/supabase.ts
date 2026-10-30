import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the build has Supabase credentials. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Browser client. Uses the ANON key only; all access is gated by Row Level
 * Security. The service-role key must never be used here.
 * Null when env vars are missing, so callers must handle that explicitly.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
