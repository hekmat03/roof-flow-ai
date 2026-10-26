/**
 * Small HTTP helpers shared by the server routes.
 * Kept dependency-free so the server bundle stays small and predictable.
 */

export const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export const json = (body: unknown, status = 200, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

/** Same-origin gate for endpoints that are for our own app, not the public web. */
export const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return true; // SSR fetch / curl / direct navigation carry no Origin
  try {
    const originHost = new URL(origin).host;
    const reqHost = request.headers.get("host") ?? new URL(request.url).host;
    return originHost === reqHost;
  } catch {
    return false;
  }
};

/** Request origin, used to build absolute return URLs. */
export const requestOrigin = (request: Request): string => {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto ?? "https"}://${host}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
};

/** Parse a JSON body without throwing on garbage. */
export const readJson = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* In-memory rate limiting                                                     */
/* -------------------------------------------------------------------------- */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Simple fixed-window limiter. Per-process and reset on restart — adequate for
 * slowing credential stuffing on a single-instance deployment; a shared store
 * would be the next step if this ever runs on more than one server.
 */
export const rateLimit = (
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } => {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
};

export const clientIp = (request: Request): string =>
  (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
  request.headers.get("x-real-ip") ||
  "unknown";
