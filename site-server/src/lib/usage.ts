/**
 * Server-side usage accounting and plan enforcement.
 * ---------------------------------------------------------------------------
 * One "conversation" = one widget chat thread that received at least one
 * server-generated AI reply. It is keyed by a server-issued conversation id, so
 * a replayed or forged id can never be counted twice, and a conversation that
 * only produced errors is never counted at all.
 *
 * Storage model (see supabase/migration.sql):
 *   usage_conversations — one row per counted conversation, PRIMARY KEY
 *                         (user_id, conversation_id). The unique constraint IS
 *                         the no-double-count guarantee, so it holds even when
 *                         two requests race.
 *   usage               — (user_id, period_start) UNIQUE, cached counter used for
 *                         fast reads and display. Rebuildable from the rows above.
 *
 * Everything here is called from server routes only. A client that edits its own
 * localStorage cannot change any of it: the plan and the counters live in the
 * database, and the limit check runs before the work is done.
 */
import { adminFetch, isConfigured, SupabaseError } from "./supabase-admin";
import { isPlanId, limitForPlan, PLANS, type PlanId } from "./plans";

export const USAGE_TABLE = "usage";
export const USAGE_CONVERSATIONS_TABLE = "usage_conversations";
export const PROFILES_TABLE = "profiles";

/** First day of the current billing month, UTC, as `YYYY-MM-01`. */
export const periodStart = (now: Date = new Date()): string => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${String(y)}-${m < 10 ? "0" : ""}${String(m)}-01`;
};

/** Next reset date, one month after the period start. */
export const periodEnd = (period: string): string => {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${String(next.y)}-${next.m < 10 ? "0" : ""}${String(next.m)}-01`;
};

export type StorageState = "ok" | "not_configured" | "table_missing" | "error";

export interface UsageSnapshot {
  userId: string;
  plan: PlanId;
  periodStart: string;
  periodEnd: string;
  used: number;
  limit: number;
  remaining: number;
  /** True when the counter could not be read from the database. */
  degraded: boolean;
  storage: StorageState;
}

const isMissingTable = (e: unknown): boolean =>
  e instanceof SupabaseError && (e.status === 404 || /PGRST205|42P01|does not exist/i.test(e.body));

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

interface ProfileRow {
  user_id: string;
  current_plan: string | null;
  subscription_status: string | null;
}

/** The plan stored for a user. Unknown/missing users are Free. */
export const planForUser = async (userId: string): Promise<PlanId> => {
  if (!isConfigured()) return "free";
  try {
    const res = await adminFetch(
      `/rest/v1/${PROFILES_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=user_id,current_plan,subscription_status&limit=1`
    );
    if (!res.ok) return "free";
    const rows = (await res.json()) as ProfileRow[];
    const plan = rows[0]?.current_plan;
    return isPlanId(plan) ? plan : "free";
  } catch {
    return "free";
  }
};

/** Exact number of counted conversations this period, from the unique rows. */
const exactCount = async (userId: string, period: string): Promise<number | null> => {
  try {
    const res = await adminFetch(
      `/rest/v1/${USAGE_CONVERSATIONS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&period_start=eq.${period}&select=conversation_id`,
      { headers: { Prefer: "count=exact", Range: "0-0" } }
    );
    if (!res.ok) return null;
    const range = res.headers.get("content-range"); // e.g. "0-0/7"
    const total = range?.split("/")[1];
    if (total && total !== "*") return Number(total);
    const rows = (await res.json()) as unknown[];
    return rows.length;
  } catch {
    return null;
  }
};

/** Cached counter from the usage table (fast path / display). */
const cachedCount = async (userId: string, period: string): Promise<number | null> => {
  try {
    const res = await adminFetch(
      `/rest/v1/${USAGE_TABLE}?user_id=eq.${encodeURIComponent(userId)}&period_start=eq.${period}&select=conversations_used&limit=1`
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ conversations_used: number | null }>;
    return rows[0]?.conversations_used ?? 0;
  } catch {
    return null;
  }
};

export const usageSnapshot = async (userId: string): Promise<UsageSnapshot> => {
  const plan = await planForUser(userId);
  const limit = limitForPlan(plan);
  const period = periodStart();
  const base: UsageSnapshot = {
    userId,
    plan,
    periodStart: period,
    periodEnd: periodEnd(period),
    used: 0,
    limit,
    remaining: limit,
    degraded: false,
    storage: "ok",
  };
  if (!isConfigured()) return { ...base, degraded: true, storage: "not_configured" };

  const exact = await exactCount(userId, period);
  const used = exact ?? (await cachedCount(userId, period));
  if (used === null) return { ...base, degraded: true, storage: "table_missing" };
  return { ...base, used, remaining: Math.max(0, limit - used) };
};

/* -------------------------------------------------------------------------- */
/* Enforcement                                                                 */
/* -------------------------------------------------------------------------- */

export interface ConsumeResult {
  allowed: boolean;
  counted: boolean;
  duplicate: boolean;
  used: number;
  limit: number;
  remaining: number;
  plan: PlanId;
  storage: StorageState;
}

/**
 * Decide whether a conversation may consume quota, and record it if so.
 *
 * Order matters: the duplicate check happens first, so replaying the same
 * conversation id is free and returns the current counter; the quota check
 * happens before any row is written, so an over-quota request changes nothing.
 */
export const consumeConversation = async (args: {
  userId: string;
  conversationId: string;
  /** Pre-resolved plan, to avoid a second profiles read. */
  plan?: PlanId;
}): Promise<ConsumeResult> => {
  const { userId, conversationId } = args;
  const period = periodStart();
  const plan = args.plan ?? (await planForUser(userId));
  const limit = limitForPlan(plan);
  const before = await exactCount(userId, period);

  if (before === null) {
    // No storage: never claim a conversation was counted.
    return {
      allowed: false,
      counted: false,
      duplicate: false,
      used: 0,
      limit,
      remaining: 0,
      plan,
      storage: isConfigured() ? "table_missing" : "not_configured",
    };
  }

  // 1. Idempotency: insert the unique (user_id, conversation_id) row. A conflict
  //    means we have already counted this thread; PostgREST returns 409.
  const insertRes = await adminFetch(`/rest/v1/${USAGE_CONVERSATIONS_TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, conversation_id: conversationId, period_start: period }),
  });
  if (!insertRes.ok) {
    const body = (await insertRes.text()).slice(0, 300);
    if (insertRes.status === 409 || /duplicate key|23505/i.test(body)) {
      return {
        allowed: true,
        counted: false,
        duplicate: true,
        used: before,
        limit,
        remaining: Math.max(0, limit - before),
        plan,
        storage: "ok",
      };
    }
    if (isMissingTable(new SupabaseError(insertRes.status, body))) {
      return {
        allowed: false,
        counted: false,
        duplicate: false,
        used: 0,
        limit,
        remaining: 0,
        plan,
        storage: "table_missing",
      };
    }
    throw new SupabaseError(insertRes.status, body);
  }

  // 2. The row is claimed; now it is safe to read the authoritative count.
  const after = (await exactCount(userId, period)) ?? before + 1;

  // 3. Quota is enforced on the authoritative count. Because the idempotency row
  //    is written first, a race can admit at most one extra conversation past the
  //    limit — never an unbounded number — and the row is removed again below.
  if (after > limit) {
    await adminFetch(
      `/rest/v1/${USAGE_CONVERSATIONS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&conversation_id=eq.${encodeURIComponent(conversationId)}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    return {
      allowed: false,
      counted: false,
      duplicate: false,
      used: before,
      limit,
      remaining: 0,
      plan,
      storage: "ok",
    };
  }

  await bumpCachedCounter(userId, period, after);
  return {
    allowed: true,
    counted: true,
    duplicate: false,
    used: after,
    limit,
    remaining: Math.max(0, limit - after),
    plan,
    storage: "ok",
  };
};

/**
 * Give a charged conversation back when the request that claimed it then failed.
 * This is what makes "failed requests never count" true rather than aspirational:
 * the unique row is removed, so the thread can be charged again later, and the
 * cached counter is rewritten from the authoritative count.
 */
export const releaseConversation = async (userId: string, conversationId: string): Promise<void> => {
  try {
    await adminFetch(
      `/rest/v1/${USAGE_CONVERSATIONS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&conversation_id=eq.${encodeURIComponent(conversationId)}`,
      { method: "DELETE" }
    );
    const period = periodStart();
    const exact = await exactCount(userId, period);
    if (exact !== null) await bumpCachedCounter(userId, period, exact);
  } catch {
    // Best effort: the unique rows remain the source of truth either way.
  }
};

/** Best-effort update of the cached counter; never throws. */
const bumpCachedCounter = async (userId: string, period: string, used: number): Promise<void> => {
  try {
    await adminFetch(`/rest/v1/${USAGE_TABLE}?on_conflict=user_id,period_start`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        period_start: period,
        conversations_used: used,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // The counter is a cache; the unique rows remain the source of truth.
  }
};

/** The 402-style response the widget surfaces when the Free allowance is spent. */
export const quotaExceededResponse = (plan: PlanId, limit: number) => ({
  ok: false,
  error: "quota_exceeded",
  plan,
  limit,
  message: `This account has used all ${String(limit)} conversations included in the ${PLANS[plan].name} plan this month.`,
  upgradeHint: "An upgrade is available from the Billing page once payments are activated.",
});

/** The 503 the product gives when the storage layer is not ready. */
export const usageStorageMissingResponse = () => ({
  ok: false,
  error: "usage_storage_unavailable",
  message: "Usage tracking is not connected yet, so this conversation was not counted.",
});
