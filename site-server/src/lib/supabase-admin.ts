/**
 * Server-only Supabase admin helpers.
 * ---------------------------------------------------------------------------
 * The service-role key is read from `process.env` inside the server process and
 * is NEVER sent to a browser: routes that use this module are server routes, and
 * nothing here returns the key (or any part of it) in a response body.
 *
 * Why not `@supabase/supabase-js` here? The public surface of this site is a
 * static SPA. Only this server can hold the service key, so all authoritative
 * writes go through plain REST calls made from here. A handful of endpoints is
 * all we need, and plain `fetch` keeps the server bundle tiny.
 */

export interface SupabaseEnv {
  url: string;
  serviceKey: string;
}

/** Read the two variables we need, trimmed, with the URL normalised. */
export const supabaseEnv = (): SupabaseEnv => ({
  url: (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, ""),
  serviceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
});

/** True when both variables are present, i.e. the database layer can be used. */
export const isConfigured = (): boolean => {
  const { url, serviceKey } = supabaseEnv();
  return Boolean(url && serviceKey);
};

/* -------------------------------------------------------------------------- */
/* Key inspection (metadata only — never the key itself)                       */
/* -------------------------------------------------------------------------- */

export interface KeyInfo {
  /** `jwt` for the classic service_role key, `opaque` for an unrecognised shape. */
  kind: "jwt" | "opaque";
  /** JWT `role` claim, e.g. `service_role`. */
  role: string | null;
  /** JWT `ref` claim — the Supabase project ref the key belongs to. */
  projectRef: string | null;
  /** ISO expiry from the JWT `exp` claim (classic Supabase keys never expire). */
  expiresAt: string | null;
  expired: boolean;
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Describes the configured key WITHOUT revealing it. Used by the health route so
 * the owner can see at a glance that the panel value is a service key for the
 * same project as the URL — a mismatched pair is the most common setup mistake.
 */
export const serviceKeyInfo = (): KeyInfo => {
  const { serviceKey } = supabaseEnv();
  const payload = decodeJwtPayload(serviceKey);
  if (!payload) return { kind: "opaque", role: null, projectRef: null, expiresAt: null, expired: false };
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  return {
    kind: "jwt",
    role: typeof payload.role === "string" ? payload.role : null,
    projectRef: typeof payload.ref === "string" ? payload.ref : null,
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    expired: exp !== null && exp * 1000 < Date.now(),
  };
};

/** The project ref embedded in the URL (`https://<ref>.supabase.co`). */
export const projectRefFromUrl = (): string | null => {
  const { url } = supabaseEnv();
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/i.exec(url);
  return m ? m[1] : null;
};

/* -------------------------------------------------------------------------- */
/* REST plumbing                                                               */
/* -------------------------------------------------------------------------- */

export class SupabaseError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`supabase_${String(status)}`);
    this.name = "SupabaseError";
    this.status = status;
    this.body = body.slice(0, 500);
  }
}

export const adminHeaders = (extra?: Record<string, string>): Record<string, string> => {
  const { serviceKey } = supabaseEnv();
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
};

/** Low-level call against the given Supabase path (e.g. `/rest/v1/leads`). */
export const adminFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const { url } = supabaseEnv();
  if (!url) throw new Error("supabase_not_configured");
  return fetch(`${url}${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
};

/** Same, but throws `SupabaseError` on a non-2xx so callers can branch on status. */
export const adminJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await adminFetch(path, init);
  const text = await res.text();
  if (!res.ok) throw new SupabaseError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
};

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

export interface SupabaseHealth {
  configured: boolean;
  /** PostgREST root reachable with the service key (a trivial authenticated query). */
  restReachable: boolean;
  /** GoTrue (auth) reachable. */
  authReachable: boolean;
  authVersion: string | null;
  /** Public tables visible to the service key. */
  tables: string[];
  /** Columns of `public.leads`, straight from the PostgREST OpenAPI document. */
  leadsColumns: string[];
  key: KeyInfo | null;
  projectRefFromUrl: string | null;
  /** True when key `ref` and URL ref agree (or the key has no `ref`). */
  keyMatchesProject: boolean;
  /** Row count returned by a trivial `select=id&limit=1` against leads. */
  leadProbeStatus: number | null;
  /** PostgREST error code/message when the probe failed (no secrets, no PII). */
  leadProbeError: string | null;
  checkedAt: string;
}

interface OpenApiDoc {
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
}

/**
 * One round trip that answers "is the storage layer wired up?", suitable for
 * showing an owner. Never returns the key, and never returns row data.
 */
export const health = async (): Promise<SupabaseHealth> => {
  const base: SupabaseHealth = {
    configured: isConfigured(),
    restReachable: false,
    authReachable: false,
    authVersion: null,
    tables: [],
    leadsColumns: [],
    key: isConfigured() ? serviceKeyInfo() : null,
    projectRefFromUrl: projectRefFromUrl(),
    keyMatchesProject: true,
    leadProbeStatus: null,
    leadProbeError: null,
    checkedAt: new Date().toISOString(),
  };
  if (!base.configured) return base;

  base.keyMatchesProject =
    !base.key?.projectRef || !base.projectRefFromUrl || base.key.projectRef === base.projectRefFromUrl;

  try {
    const doc = await adminJson<OpenApiDoc>("/rest/v1/");
    base.restReachable = true;
    const defs = doc?.definitions ?? {};
    base.tables = Object.keys(defs).sort();
    base.leadsColumns = Object.keys(defs["leads"]?.properties ?? {}).sort();
  } catch {
    base.restReachable = false;
  }

  try {
    const res = await adminFetch("/auth/v1/health");
    base.authReachable = res.ok;
    if (res.ok) {
      const body = (await res.json()) as { version?: string };
      base.authVersion = body.version ?? null;
    }
  } catch {
    base.authReachable = false;
  }

  try {
    const res = await adminFetch("/rest/v1/leads?select=id&limit=1");
    base.leadProbeStatus = res.status;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      base.leadProbeError = body;
    }
  } catch {
    base.leadProbeStatus = null;
    base.leadProbeError = "network_error";
  }

  return base;
};
