// api/_lib/tenant.ts
// Which company does this signed-in user belong to? The answer ALWAYS comes from
// the database (profiles.tenant_id) for the verified user — never from anything
// the browser sends. No runtime imports, so tests can load it with Node directly.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export type TenantLookup =
  | { ok: true; tenantId: string }
  | { ok: false; status: 403 | 503; code: 'no_workspace' | 'workspace_unavailable'; error: string };

/** Minimal shape of the Supabase admin client that we need (keeps this file import-free). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ProfileReader { from: (table: string) => any }

/** Fails CLOSED: any doubt (error, no profile, no tenant) means no access. */
export async function lookupTenant(admin: ProfileReader, userId: string): Promise<TenantLookup> {
  const { data, error } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 503, code: 'workspace_unavailable', error: 'Your workspace is unavailable, try again shortly' };
  }
  const tenantId = data?.tenant_id;
  if (!isUuid(tenantId)) {
    return { ok: false, status: 403, code: 'no_workspace', error: 'Your workspace has not been created yet' };
  }
  return { ok: true, tenantId };
}
