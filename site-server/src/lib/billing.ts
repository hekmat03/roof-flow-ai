/**
 * Profile helper shared by the billing routes.
 * ---------------------------------------------------------------------------
 * Payments run through Lemon Squeezy (see ./lemon.ts and /api/lemon-webhook).
 * This file only reads the `profiles` row that the Lemon webhook writes; it
 * never talks to a payment provider.
 */
import { adminFetch, isConfigured } from "./supabase-admin";

export const PROFILES_TABLE = "profiles";

export interface ProfileRow {
  user_id: string;
  current_plan: string | null;
  subscription_status: string | null;
  ls_customer_id: string | null;
  ls_subscription_id: string | null;
  ls_variant_id: string | null;
  ls_portal_url: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export const getProfile = async (userId: string): Promise<ProfileRow | null> => {
  if (!isConfigured()) return null;
  const res = await adminFetch(
    `/rest/v1/${PROFILES_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as ProfileRow[];
  return rows[0] ?? null;
};
