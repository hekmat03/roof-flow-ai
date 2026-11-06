/**
 * tenant.ts — who owns what.
 * ---------------------------------------------------------------------------
 * RULE: a tenant id is NEVER taken from a request. It is derived server-side,
 * from one of exactly two trusted sources:
 *
 *   - a signed-in user      → profiles.tenant_id   (CRM reads)
 *   - a widget public key   → tenants.widget_key   (widget lead inserts)
 *
 * The service-role key bypasses Row Level Security, so these lookups plus the
 * `tenant_id=eq.…` filter in leads-core.ts ARE the isolation boundary.
 */
import { adminFetch } from "./supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Exactly the shape migration 006 generates: "wk_" + 32 lowercase hex chars. */
const WIDGET_KEY_RE = /^wk_[a-f0-9]{32}$/;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
export const isWidgetKey = (v: unknown): v is string => typeof v === "string" && WIDGET_KEY_RE.test(v);

const getRows = async <T>(path: string): Promise<T[]> => {
  const res = await adminFetch(path);
  if (!res.ok) throw new Error(`supabase_select_failed_${String(res.status)}`);
  return (await res.json()) as T[];
};

/**
 * Widget key → tenant id, or null when the key matches no company.
 * The key is shape-checked first, so nothing but `wk_<hex>` ever reaches a query.
 */
export const tenantIdForWidgetKey = async (key: unknown): Promise<string | null> => {
  if (!isWidgetKey(key)) return null;
  const rows = await getRows<{ id?: string }>(
    `/rest/v1/tenants?select=id&widget_key=eq.${encodeURIComponent(key)}&limit=1`
  );
  const id = rows[0]?.id;
  return isUuid(id) ? id : null;
};

export interface UserTenant {
  tenantId: string;
  /** The company's public embed key (for the widget snippet). */
  widgetKey: string | null;
}

const widgetKeyFor = async (tenantId: string): Promise<string | null> => {
  const rows = await getRows<{ widget_key?: string }>(
    `/rest/v1/tenants?select=widget_key&id=eq.${encodeURIComponent(tenantId)}&limit=1`
  );
  const key = rows[0]?.widget_key;
  return isWidgetKey(key) ? key : null;
};

/**
 * Signed-in user → their tenant. Returns null when the user has no profile.
 *
 * A profile without a tenant (the signup trigger from 001_multitenant.sql was
 * not installed, or ran before it existed) gets one provisioned here, exactly
 * once: the profile update only applies while tenant_id IS NULL, so two
 * concurrent first requests cannot give one user two companies.
 */
export const tenantForUser = async (userId: string, nameHint?: string): Promise<UserTenant | null> => {
  if (!isUuid(userId)) return null;
  const uid = encodeURIComponent(userId);

  const profiles = await getRows<{ tenant_id?: string | null }>(
    `/rest/v1/profiles?select=tenant_id&user_id=eq.${uid}&limit=1`
  );
  const profile = profiles[0];
  if (!profile) return null;

  let tenantId = isUuid(profile.tenant_id) ? profile.tenant_id : null;

  if (!tenantId) {
    const created = await adminFetch("/rest/v1/tenants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: (nameHint ?? "").slice(0, 120) || "New contractor" }),
    });
    if (!created.ok) throw new Error(`tenant_create_failed_${String(created.status)}`);
    const newId = ((await created.json()) as Array<{ id?: string }>)[0]?.id;
    if (!isUuid(newId)) throw new Error("tenant_create_empty");

    const claimed = await adminFetch(`/rest/v1/profiles?user_id=eq.${uid}&tenant_id=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ tenant_id: newId }),
    });
    if (!claimed.ok) throw new Error(`tenant_claim_failed_${String(claimed.status)}`);
    const claimedRows = (await claimed.json()) as Array<{ tenant_id?: string }>;

    if (claimedRows.length > 0) {
      tenantId = newId;
    } else {
      // Lost a race: another request already assigned one. Use theirs.
      const again = await getRows<{ tenant_id?: string | null }>(
        `/rest/v1/profiles?select=tenant_id&user_id=eq.${uid}&limit=1`
      );
      const winner = again[0]?.tenant_id;
      if (!isUuid(winner)) throw new Error("tenant_unresolved");
      tenantId = winner;
    }
  }

  return { tenantId, widgetKey: await widgetKeyFor(tenantId) };
};
