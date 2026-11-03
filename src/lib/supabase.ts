import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// `import.meta.env` only exists under Vite; guard it so the module can also be
// imported by the plain-Node check scripts (tests/*.check.ts).
const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const url = viteEnv.VITE_SUPABASE_URL;
const anonKey = viteEnv.VITE_SUPABASE_ANON_KEY;

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
