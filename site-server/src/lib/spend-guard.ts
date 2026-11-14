/**
 * spend-guard.ts — the lock on the AI wallet.
 * ---------------------------------------------------------------------------
 * /api/widget-reply is PUBLIC and every real reply costs money (xAI Grok). Before the
 * server may call the paid AI, ALL of these must pass:
 *
 *   1. the request names a real contractor (widget key → tenant)
 *   2. per-IP cap       (slows one visitor or script)
 *   3. per-company cap  (one contractor cannot drain the budget)
 *   4. global daily cap (absolute ceiling for the whole product)
 *
 * Counters live in Postgres (hit_rate_limit, supabase/008_spend_limits.sql), so
 * they are shared by every server instance and survive restarts. The company and
 * global caps do not depend on the visitor's IP, so rotating fake IP headers
 * cannot get around them.
 *
 * It fails CLOSED: if the counters cannot be read, the AI is NOT called. The
 * widget then simply uses its free scripted questions.
 *
 * Tune with environment variables (all optional):
 *   WIDGET_AI_IP_MAX        replies per IP per 10 minutes   (default 8)
 *   WIDGET_AI_TENANT_DAILY  replies per company per day     (default 300)
 *   WIDGET_AI_GLOBAL_DAILY  replies for everyone per day    (default 3000)
 */
import { adminFetch, isConfigured } from "./supabase-admin";
import { isWidgetKey, tenantIdForWidgetKey } from "./tenant";

const DAY_SECONDS = 86_400;
const IP_WINDOW_SECONDS = 600;

const envInt = (name: string, fallback: number): number => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const widgetAiCaps = () => ({
  ipMax: envInt("WIDGET_AI_IP_MAX", 8),
  tenantDaily: envInt("WIDGET_AI_TENANT_DAILY", 300),
  globalDaily: envInt("WIDGET_AI_GLOBAL_DAILY", 3000),
});

/** One database counter. true = allowed, false = over the limit, null = could not check. */
const hit = async (key: string, max: number, windowSeconds: number): Promise<boolean | null> => {
  try {
    const res = await adminFetch("/rest/v1/rpc/hit_rate_limit", {
      method: "POST",
      body: JSON.stringify({ p_key: key, p_limit: max, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return typeof data === "boolean" ? data : null;
  } catch {
    return null;
  }
};

export type WidgetAiDecision =
  | { allowed: true; tenantId: string }
  | {
      allowed: false;
      /** Internal reason (for logs). Never contains visitor data. */
      reason: "no_widget" | "unknown_widget" | "ip_limit" | "tenant_limit" | "global_limit" | "unavailable";
      /** 200 = not an error, just "use the scripted flow". */
      status: 200 | 429 | 503;
      retryAfterSec?: number;
    };

const over = (reason: "ip_limit" | "tenant_limit" | "global_limit", retryAfterSec: number): WidgetAiDecision => ({
  allowed: false,
  reason,
  status: 429,
  retryAfterSec,
});
const unavailable: WidgetAiDecision = { allowed: false, reason: "unavailable", status: 503 };

export const authorizeWidgetAi = async (ip: string, widgetKey: unknown): Promise<WidgetAiDecision> => {
  if (!isWidgetKey(widgetKey)) return { allowed: false, reason: "no_widget", status: 200 };
  if (!isConfigured()) return unavailable;

  let tenantId: string | null;
  try {
    tenantId = await tenantIdForWidgetKey(widgetKey);
  } catch {
    return unavailable;
  }
  if (!tenantId) return { allowed: false, reason: "unknown_widget", status: 200 };

  const caps = widgetAiCaps();

  // Cheapest check first; a blocked request never touches the later counters.
  const ipOk = await hit(`widgetai:ip:${ip}`, caps.ipMax, IP_WINDOW_SECONDS);
  if (ipOk === null) return unavailable;
  if (!ipOk) return over("ip_limit", IP_WINDOW_SECONDS);

  const tenantOk = await hit(`widgetai:tenant:${tenantId}`, caps.tenantDaily, DAY_SECONDS);
  if (tenantOk === null) return unavailable;
  if (!tenantOk) return over("tenant_limit", 3600);

  const globalOk = await hit("widgetai:global", caps.globalDaily, DAY_SECONDS);
  if (globalOk === null) return unavailable;
  if (!globalOk) return over("global_limit", 3600);

  return { allowed: true, tenantId };
};
