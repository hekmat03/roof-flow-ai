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

/**
 * Environment variables that name the site's public address, if the deployment
 * sets one. Optional: the proxy headers below are enough on this platform.
 */
const PUBLIC_URL_ENV_VARS = ["PUBLIC_ORIGIN", "PUBLIC_URL", "SITE_URL"];

/**
 * This site's own public address. The platform proxy in front of port 3000 does
 * not forward the public hostname in a header the app can see (verified: a
 * request with `Origin: <public site>` still arrived with an internal host), so
 * the address is listed here; the env vars above override it if it ever moves.
 */
const DEFAULT_PUBLIC_ORIGINS = ["https://576127cef4e964ad11707bbdd13ace2d.ctonew.app"];

/** Every hostname this request may legitimately have been addressed as. */
const hostCandidates = (request: Request): Set<string> => {
  const hosts = new Set<string>();
  for (const header of ["host", "x-forwarded-host", "x-original-host"]) {
    const raw = request.headers.get(header);
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const value = part.trim().toLowerCase();
      if (value) hosts.add(value);
    }
  }
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    /* not an absolute URL — the headers above still apply */
  }
  for (const origin of DEFAULT_PUBLIC_ORIGINS) {
    try {
      hosts.add(new URL(origin).host.toLowerCase());
    } catch {
      /* ignore a malformed default */
    }
  }
  for (const name of PUBLIC_URL_ENV_VARS) {
    const raw = process.env[name];
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).host.toLowerCase());
    } catch {
      /* ignore a malformed override */
    }
  }
  return hosts;
};

/**
 * Same-origin gate for endpoints that are for our own app, not the public web.
 *
 * The Origin header is checked against every host this request could have been
 * addressed as — not just `host`. Behind the platform proxy the app sees the
 * internal host (e.g. `localhost:3000`) while the browser sends the public
 * hostname, so comparing those two directly rejected every browser POST
 * (sign-up, sign-in, sign-out, checkout) with `forbidden_origin` while looking
 * perfectly healthy from curl, which sends no Origin at all. `x-forwarded-host`
 * carries the public hostname the proxy received.
 *
 * Requests without an Origin (curl, SSR fetch, direct navigation) are allowed.
 * Cross-site posts cannot abuse the relaxed check: they carry the attacker's
 * Origin, and the session cookie is HttpOnly + SameSite=Lax so it is never
 * attached to them anyway.
 */
export const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false; // sandboxed iframe / file:// — never ours
  try {
    return hostCandidates(request).has(new URL(origin).host.toLowerCase());
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
