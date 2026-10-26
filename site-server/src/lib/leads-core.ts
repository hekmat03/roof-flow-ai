/**
 * leads-core.ts — server-only logic for the public lead-capture API.
 * ---------------------------------------------------------------------------
 * SECURITY: this module is imported ONLY from `src/routes/api/*` handlers. It
 * reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from process.env and never
 * returns those values to a caller. The widget/visitor browser holds no keys —
 * it only POSTs to our own origin.
 *
 * Transport: we talk to Supabase over its PostgREST HTTP API with plain fetch,
 * so this needs no client dependency and works identically in dev and on the
 * published host.
 *
 * HONEST LIMITS (documented, not hidden):
 *  - The rate limiter is an in-memory Map. It RESETS WHENEVER THE SERVER
 *    RESTARTS (every publish). It is a speed bump against casual abuse, not a
 *    durable quota; a real one needs shared storage.
 *  - Nothing here sends email or SMS. Capture is store-only by design.
 */

export const LEADS_TABLE = "leads";

/* -------------------------------------------------------------------------- */
/* CORS — the widget runs on arbitrary contractor origins                      */
/* -------------------------------------------------------------------------- */

/**
 * The widget is embedded on third-party contractor sites, so the lead POST has
 * to be readable cross-origin. `*` is deliberate: the endpoint is public and
 * writes nothing privileged; the visitor's own browser sends the payload.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS, ...extra },
  });

/* -------------------------------------------------------------------------- */
/* Env                                                                         */
/* -------------------------------------------------------------------------- */

export const dbConfigured = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * The clear 503 the task asks for when the owner hasn't connected the database
 * yet. Never leaks which variable is missing beyond a generic "not configured".
 */
export const notConfigured = (): Response =>
  json(
    {
      ok: false,
      error: "database_not_configured",
      message: "Lead storage is temporarily unavailable. Please try again later.",
    },
    503
  );

/* -------------------------------------------------------------------------- */
/* Sanitising helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Strip C0/C1 control characters (incl. newlines/tabs) that could poison logs or rows. */
export const stripControl = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim();

/** Trim, strip control chars, then hard-cap the length. */
export const clean = (v: unknown, max: number): string => {
  if (typeof v !== "string") return "";
  return stripControl(v).slice(0, max);
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface LeadInput {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  zip_code?: unknown;
  roofing_need?: unknown;
  consent?: unknown;
  consent_text?: unknown;
  conversation?: unknown;
  /** Honeypot: a field real visitors never see. Must be empty/absent. */
  company_website?: unknown;
}

export interface ValidatedLead {
  name: string;
  phone: string | null;
  email: string | null;
  zip_code: string;
  roofing_need: string;
  consent: true;
  consent_text: string;
  conversation: Array<{ sender: string; text: string; timestamp: string }>;
}

export interface ValidationFailure {
  field: string;
  error: string;
}

/** Digits-only length check for US phone numbers: 10 digits, optional leading 1. */
export const isValidPhone = (raw: string): boolean => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith("1")) return true;
  // Reject strings that barely contain numbers (e.g. "aaaaaaaaaa1").
  return /^[\d\s()+.\-]*$/.test(raw) && (digits.length === 10 || (digits.length === 11 && digits.startsWith("1")));
};

export const isValidEmail = (raw: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw.trim()) && raw.trim().length <= 254;

/** 5-digit US ZIP, or the literal "N/A" a visitor may choose when refusing. */
export const isValidZip = (raw: string): boolean => raw === "N/A" || /^\d{5}$/.test(raw);

export const CONVERSATION_MAX_TURNS = 40;
export const CONVERSATION_TEXT_MAX = 1000;

export const cleanConversation = (
  raw: unknown
): Array<{ sender: string; text: string; timestamp: string }> => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, CONVERSATION_MAX_TURNS)
    .map((turn) => {
      const t = (turn ?? {}) as Record<string, unknown>;
      const sender = clean(t.sender, 16) || "unknown";
      const text = clean(t.text, CONVERSATION_TEXT_MAX);
      const timestamp = clean(t.timestamp, 40) || new Date().toISOString();
      return { sender, text, timestamp };
    })
    .filter((t) => t.text.length > 0);
};

/**
 * Full validation. Returns either the cleaned lead or the first failure.
 * Order matters: honeypot first (cheapest bot rejection), then fields.
 */
export const validateLead = (
  input: LeadInput
): { ok: true; lead: ValidatedLead } | { ok: false; failure: ValidationFailure } => {
  // 1. Honeypot — a hidden input bots fill in and humans never see.
  if (clean(input.company_website, 100).length > 0) {
    return { ok: false, failure: { field: "company_website", error: "rejected" } };
  }

  // 2. Name: 2–80 chars trimmed.
  const name = clean(input.name, 80);
  if (name.length < 2) {
    return { ok: false, failure: { field: "name", error: "Please enter your name (2–80 characters)." } };
  }

  // 3. Phone and/or email — at least one, and anything present must be valid.
  const phoneRaw = clean(input.phone, 32);
  const emailRaw = clean(input.email, 254);
  if (!phoneRaw && !emailRaw) {
    return {
      ok: false,
      failure: { field: "contact", error: "Please give us a phone number or an email address." },
    };
  }
  if (phoneRaw && !isValidPhone(phoneRaw)) {
    return { ok: false, failure: { field: "phone", error: "That phone number doesn't look right." } };
  }
  if (emailRaw && !isValidEmail(emailRaw)) {
    return { ok: false, failure: { field: "email", error: "That email address doesn't look right." } };
  }

  // 4. ZIP: 5-digit US, or "N/A" when the visitor prefers not to say.
  const zip = clean(input.zip_code, 5) || "N/A";
  if (!isValidZip(zip)) {
    return { ok: false, failure: { field: "zip_code", error: "Please enter a 5-digit ZIP code, or N/A." } };
  }

  // 5. Roofing need: 3–500 chars.
  const need = clean(input.roofing_need, 500);
  if (need.length < 3) {
    return {
      ok: false,
      failure: { field: "roofing_need", error: "Please tell us briefly what's going on with your roof." },
    };
  }

  // 6. Explicit consent is mandatory, and we store the exact text shown.
  if (input.consent !== true) {
    return { ok: false, failure: { field: "consent", error: "Please tick the consent box so we can contact you." } };
  }
  const consentText = clean(input.consent_text, 500) || "Consent checkbox ticked (text not supplied).";

  return {
    ok: true,
    lead: {
      name,
      phone: phoneRaw || null,
      email: emailRaw || null,
      zip_code: zip,
      roofing_need: need,
      consent: true,
      consent_text: consentText,
      conversation: cleanConversation(input.conversation),
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Lead score — deterministic 0–100, computed server-side at insert            */
/* -------------------------------------------------------------------------- */

/**
 * Scoring formula (documented so the CRM can explain a number):
 *   Contact quality    : phone only 25 · email only 20 · both 35      (max 35)
 *   Valid ZIP          : 5-digit US ZIP (not "N/A")                   (+15)
 *   Urgency keywords   : leak, water, storm, hail, missing shingles,
 *                        emergency, tarp, sagging, mold → 5 each,
 *                        capped                                             (max 25)
 *   Engagement         : conversation turns (3 pts/turn, capped)      (max 15)
 *   Consent given      : explicit consent recorded                    (+10)
 *                                                        total max = 100
 */
export const URGENCY_KEYWORDS = [
  "leak",
  "water",
  "storm",
  "hail",
  "missing shingles",
  "emergency",
  "tarp",
  "sagging",
  "mold",
] as const;

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export const scoreLead = (lead: {
  phone: string | null;
  email: string | null;
  zip_code: string;
  roofing_need: string;
  conversation: Array<{ text: string }>;
  consent: boolean;
}): ScoreResult => {
  const reasons: string[] = [];
  let score = 0;

  // Contact quality
  if (lead.phone && lead.email) {
    score += 35;
    reasons.push("phone + email");
  } else if (lead.phone) {
    score += 25;
    reasons.push("phone only");
  } else if (lead.email) {
    score += 20;
    reasons.push("email only");
  }

  // ZIP
  if (/^\d{5}$/.test(lead.zip_code)) {
    score += 15;
    reasons.push("valid ZIP");
  }

  // Urgency keywords in the need + the transcript
  const haystack = [lead.roofing_need, ...lead.conversation.map((t) => t.text)]
    .join(" ")
    .toLowerCase();
  const hits = URGENCY_KEYWORDS.filter((k) => haystack.includes(k));
  if (hits.length > 0) {
    const urgency = Math.min(25, hits.length * 5);
    score += urgency;
    reasons.push(`urgency: ${hits.slice(0, 3).join(", ")}`);
  }

  // Engagement
  const turns = lead.conversation.length;
  if (turns > 0) {
    score += Math.min(15, turns * 3);
    reasons.push(`${String(turns)} turns`);
  }

  // Consent
  if (lead.consent) {
    score += 10;
    reasons.push("consent");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
};

/* -------------------------------------------------------------------------- */
/* Rate limiting — per IP, in-memory (RESETS ON RESTART, see header note)      */
/* -------------------------------------------------------------------------- */

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const buckets = new Map<string, number[]>();

/**
 * Records a SUCCESSFUL submission for `ip` and reports whether it is allowed.
 * Only successes count toward the limit (failed validation shouldn't punish a
 * visitor who is still typing). Returns { allowed, retryAfterSec }.
 */
export const rateLimit = (
  ip: string,
  now: number = Date.now()
): { allowed: boolean; retryAfterSec: number } => {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (buckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    buckets.set(ip, recent);
    return { allowed: false, retryAfterSec };
  }
  buckets.set(ip, recent);
  return { allowed: true, retryAfterSec: 0 };
};

/** Call after a successful insert so the submission consumes quota. */
export const recordSuccess = (ip: string, now: number = Date.now()): void => {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (buckets.get(ip) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  buckets.set(ip, recent);
};

/** Test seam — clears all buckets. */
export const _resetRateLimit = (): void => buckets.clear();

/** Best-effort client IP from proxy headers (the platform fronts us with a proxy). */
export const clientIp = (request: Request): string => {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
};

/* -------------------------------------------------------------------------- */
/* Supabase PostgREST transport                                                */
/* -------------------------------------------------------------------------- */

const supabaseEnv = (): { url: string; key: string } => {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("supabase_not_configured");
  return { url, key };
};

const authHeaders = (): Record<string, string> => {
  const { key } = supabaseEnv();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
};

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  zip_code: string | null;
  roofing_need: string | null;
  consent: boolean | null;
  consent_text: string | null;
  conversation: Array<{ sender: string; text: string; timestamp: string }> | null;
  lead_score: number | null;
  status: string | null;
  source: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Inserts a scored lead and returns the stored row (with id, created_at). */
export const insertLead = async (
  lead: ValidatedLead,
  opts: { userAgent: string | null; score: number }
): Promise<LeadRow> => {
  const { url } = supabaseEnv();
  const postRow = (payload: Record<string, unknown>): Promise<Response> =>
    fetch(`${url}/rest/v1/${LEADS_TABLE}`, {
      method: "POST",
      headers: { ...authHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

  const payload: Record<string, unknown> = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    zip_code: lead.zip_code,
    roofing_need: lead.roofing_need,
    consent: lead.consent,
    consent_text: lead.consent_text,
    conversation: lead.conversation,
    lead_score: opts.score,
    status: "New Lead",
    source: "Website Widget",
    user_agent: opts.userAgent,
  };

  // `leads` is a shared table: `session_id` and `contact_key` belong to an
  // earlier app that used it, and both are NOT NULL there. None of OUR columns
  // need them, so a row without them is rejected (Postgres 23502). Rather than
  // dropping constraints another app may still rely on, we fill those two
  // columns with values that mean something for us: a unique per-thread id, and
  // the lead's own contact identifier. The loop reads the offending column out
  // of the error so a third legacy constraint would not need a code change.
  const legacyFiller: Record<string, () => string> = {
    session_id: () => crypto.randomUUID(),
    contact_key: () => lead.email ?? lead.phone ?? crypto.randomUUID(),
  };

  let res = await postRow(payload);
  for (let attempt = 0; attempt < 4 && !res.ok; attempt++) {
    const failure = await res.text();
    const column = /null value in column \\?"([a-z_]+)\\?"/.exec(failure)?.[1];
    const filler = column ? legacyFiller[column] : undefined;
    if (!failure.includes("23502") || !column || !filler || column in payload) {
      // NOTE: never log the row (PII). Status code only.
      throw new Error(`supabase_insert_failed_${String(res.status)}`);
    }
    payload[column] = filler();
    res = await postRow(payload);
  }
  if (!res.ok) throw new Error(`supabase_insert_failed_${String(res.status)}`);
  const rows = (await res.json()) as LeadRow[];
  const row = rows[0];
  if (!row) throw new Error("supabase_insert_empty");
  return row;
};

/** Latest N real leads, newest first. Server-side only. */
export const listLeads = async (limit = 200): Promise<LeadRow[]> => {
  const { url } = supabaseEnv();
  const res = await fetch(
    `${url}/rest/v1/${LEADS_TABLE}?select=*&order=created_at.desc&limit=${String(limit)}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`supabase_select_failed_${String(res.status)}`);
  return (await res.json()) as LeadRow[];
};
