export {};
/**
 * Lead privacy + account isolation — offline checks.
 * ---------------------------------------------------------------------------
 * Runs the REAL handlers (src/lib/leads-handlers.ts) against an in-memory fake of
 * Supabase (PostgREST + GoTrue) installed as the global `fetch`. The fake HONORS
 * query filters (`col=eq.x`, `col=is.null`), so if a tenant filter were ever
 * dropped from a query these tests would see another company's rows and fail.
 *
 * Run (from site-server/):
 *   node --experimental-strip-types --import ../tests/register-ts.mjs tests/leads-isolation.check.ts
 */
process.env.SUPABASE_URL = "https://fake-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake_service_key_for_offline_tests";

const { handleLeadsGet, handleLeadsPost } = await import("../src/lib/leads-handlers.ts");
const { listLeads, insertLead, _resetRateLimit } = await import("../src/lib/leads-core.ts");
const { createSessionToken } = await import("../src/lib/auth.ts");

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    console.log("  ❌", name);
  }
};

/* -------------------------------------------------------------------------- */
/* Fixtures: two competing roofing companies + one orphaned legacy lead        */
/* -------------------------------------------------------------------------- */
const TENANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const TENANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const USER_A = "11111111-0000-4000-8000-00000000000a";
const USER_B = "22222222-0000-4000-8000-00000000000b";
const USER_NOTENANT = "33333333-0000-4000-8000-00000000000c";
const USER_UNCONFIRMED = "44444444-0000-4000-8000-00000000000d";
const KEY_A = "wk_" + "a".repeat(32);
const KEY_B = "wk_" + "b".repeat(32);
const TOKENS: Record<string, { id: string; email: string; email_confirmed_at: string | null }> = {
  tok_a: { id: USER_A, email: "a@roofa.test", email_confirmed_at: "2026-01-01T00:00:00Z" },
  tok_b: { id: USER_B, email: "b@roofb.test", email_confirmed_at: "2026-01-01T00:00:00Z" },
  tok_nt: { id: USER_NOTENANT, email: "nt@roofc.test", email_confirmed_at: "2026-01-01T00:00:00Z" },
  tok_unconfirmed: { id: USER_UNCONFIRMED, email: "u@roofd.test", email_confirmed_at: null },
};

type Row = Record<string, unknown>;
const db = {
  tenants: [
    { id: TENANT_A, name: "Roof A", widget_key: KEY_A },
    { id: TENANT_B, name: "Roof B", widget_key: KEY_B },
  ] as Row[],
  profiles: [
    { user_id: USER_A, tenant_id: TENANT_A },
    { user_id: USER_B, tenant_id: TENANT_B },
    { user_id: USER_NOTENANT, tenant_id: null },
    { user_id: USER_UNCONFIRMED, tenant_id: TENANT_A },
  ] as Row[],
  leads: [
    { id: "lead-a1", tenant_id: TENANT_A, name: "Alice Customer-A", email: "alice@a.test", created_at: "2026-02-01T00:00:00Z", session_id: "secret-session", contact_key: "secret-key" },
    { id: "lead-b1", tenant_id: TENANT_B, name: "Bob Customer-B", email: "bob@b.test", created_at: "2026-02-02T00:00:00Z", session_id: "secret-session", contact_key: "secret-key" },
    { id: "lead-legacy", tenant_id: null, name: "Legacy Orphan", email: "old@legacy.test", created_at: "2025-01-01T00:00:00Z" },
  ] as Row[],
};
const leadSelectUrls: string[] = [];

/* -------------------------------------------------------------------------- */
/* Fake Supabase                                                               */
/* -------------------------------------------------------------------------- */
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const matches = (row: Row, params: URLSearchParams): boolean => {
  for (const [col, expr] of params.entries()) {
    if (["select", "order", "limit", "on_conflict"].includes(col)) continue;
    if (expr.startsWith("eq.")) {
      if (String(row[col]) !== expr.slice(3)) return false;
    } else if (expr === "is.null") {
      if (row[col] !== null && row[col] !== undefined) return false;
    }
  }
  return true;
};

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const body = init?.body ? (JSON.parse(String(init.body)) as Row) : {};

  if (url.pathname === "/auth/v1/user") {
    const token = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const user = TOKENS[token];
    return user ? reply(user) : reply({ msg: "invalid JWT" }, 401);
  }

  const m = /^\/rest\/v1\/(tenants|profiles|leads)$/.exec(url.pathname);
  if (!m) return reply({ message: "not found" }, 404);
  const table = m[1] as keyof typeof db;
  const rows = db[table];

  if (method === "GET") {
    if (table === "leads") leadSelectUrls.push(url.search);
    let out = rows.filter((r) => matches(r, url.searchParams));
    const limit = Number(url.searchParams.get("limit") ?? "1000");
    if (url.searchParams.get("order")?.startsWith("created_at.desc")) {
      out = [...out].sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    }
    // Like PostgREST: `select=a,b,c` returns only those columns (`*` = all).
    const select = url.searchParams.get("select") ?? "*";
    const cols = select === "*" ? null : select.split(",");
    const projected = cols ? out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))) : out;
    return reply(projected.slice(0, limit));
  }
  if (method === "POST") {
    const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...body };
    if (table === "tenants") row.widget_key = "wk_" + crypto.randomUUID().replace(/-/g, "");
    rows.push(row);
    return reply([row], 201);
  }
  if (method === "PATCH") {
    const hit = rows.filter((r) => matches(r, url.searchParams));
    hit.forEach((r) => Object.assign(r, body));
    return reply(hit);
  }
  return reply({ message: "unsupported" }, 405);
}) as typeof fetch;

/* -------------------------------------------------------------------------- */
/* Request helpers                                                             */
/* -------------------------------------------------------------------------- */
const getLeads = (headers: Record<string, string> = {}) =>
  handleLeadsGet(new Request("https://crm.test/api/leads", { method: "GET", headers: { host: "crm.test", ...headers } }));

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

let ipCounter = 0;
const postLead = (extra: Record<string, unknown> = {}) => {
  _resetRateLimit();
  return handleLeadsPost(
    new Request("https://crm.test/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${String(++ipCounter)}` },
      body: JSON.stringify({
        name: "Visitor Person",
        phone: "(555) 123-4567",
        zip_code: "75001",
        roofing_need: "water leak after the storm",
        consent: true,
        consent_text: "ok",
        conversation: [],
        ...extra,
      }),
    })
  );
};

const names = async (res: Response): Promise<string[]> =>
  ((await res.json()) as { leads?: Array<{ name: string }> }).leads?.map((l) => l.name) ?? [];

/* -------------------------------------------------------------------------- */
/* 1. GET requires authentication                                              */
/* -------------------------------------------------------------------------- */
console.log("\nGET /api/leads — authentication");
{
  const res = await getLeads();
  const text = await res.text();
  check("anonymous request → 401", res.status === 401);
  check("anonymous response leaks no customer data", !/Customer|@a\.test|@b\.test|Orphan/.test(text));

  check("garbage bearer token → 401", (await getLeads(bearer("not-a-token"))).status === 401);
  check("unconfirmed-email user → 401", (await getLeads(bearer("tok_unconfirmed"))).status === 401);
  check("empty 'Bearer' header → 401", (await getLeads({ authorization: "Bearer " })).status === 401);

  const forged = Buffer.from(JSON.stringify({ userId: USER_A, email: "a@roofa.test", exp: 9999999999 })).toString("base64url");
  check("forged session cookie → 401", (await getLeads({ cookie: `rf_session=${forged}.AAAA` })).status === 401);

  check(
    "a bad bearer does NOT fall back to a valid cookie",
    (await getLeads({ ...bearer("bad"), cookie: `rf_session=${createSessionToken(USER_A, "a@roofa.test")}` })).status === 401
  );

  const cross = await getLeads({ ...bearer("tok_a"), origin: "https://evil.example" });
  check("cross-origin GET → 403 even with a valid token", cross.status === 403);
}

/* -------------------------------------------------------------------------- */
/* 2. GET is filtered by tenant                                                */
/* -------------------------------------------------------------------------- */
console.log("\nGET /api/leads — tenant isolation");
{
  const a = await getLeads(bearer("tok_a"));
  const aText = await a.clone().text();
  check("company A → 200", a.status === 200);
  check("company A sees exactly its own lead", JSON.stringify(await names(a.clone())) === JSON.stringify(["Alice Customer-A"]));
  check("company A cannot see company B's data anywhere in the body", !/Bob|@b\.test|Customer-B/.test(aText));
  check("legacy tenant-less rows are visible to nobody", !/Legacy|Orphan/.test(aText));
  check("internal legacy columns are not returned", !/secret-session|secret-key|session_id|contact_key/.test(aText));
  check("tenant_id is not echoed to the client", !/tenant_id/.test(aText));

  const b = await getLeads(bearer("tok_b"));
  check("company B sees exactly its own lead", JSON.stringify(await names(b)) === JSON.stringify(["Bob Customer-B"]));

  const cookie = await getLeads({ cookie: `rf_session=${createSessionToken(USER_A, "a@roofa.test")}` });
  check("cookie-session path is scoped to the same tenant", JSON.stringify(await names(cookie)) === JSON.stringify(["Alice Customer-A"]));

  check("response has no CORS header (private data)", a.headers.get("access-control-allow-origin") === null);
  check("response is not cacheable", a.headers.get("cache-control") === "no-store");

  check("EVERY leads query carried a tenant_id filter", leadSelectUrls.length > 0 && leadSelectUrls.every((q) => /[?&]tenant_id=eq\./.test(q)));
  check("no leads query used select=*", leadSelectUrls.every((q) => !/select=\*/.test(q)));
}

/* -------------------------------------------------------------------------- */
/* 3. Users with no workspace fail closed                                      */
/* -------------------------------------------------------------------------- */
console.log("\nGET /api/leads — workspace provisioning");
{
  const res = await getLeads(bearer("tok_nt"));
  const body = (await res.json()) as { ok?: boolean; leads?: unknown[] };
  check("tenant-less user gets a fresh, EMPTY workspace (not everyone's leads)", res.status === 200 && body.leads?.length === 0);
  const prof = db.profiles.find((p) => p.user_id === USER_NOTENANT);
  check("a tenant was provisioned and linked to the profile", Boolean(prof?.tenant_id) && prof?.tenant_id !== TENANT_A && prof?.tenant_id !== TENANT_B);

  const noProfile = createSessionToken("55555555-0000-4000-8000-00000000000e", "ghost@x.test");
  check("signed-in user with no profile → 403, no data", (await getLeads({ cookie: `rf_session=${noProfile}` })).status === 403);
}

/* -------------------------------------------------------------------------- */
/* 4. POST attaches the tenant                                                 */
/* -------------------------------------------------------------------------- */
console.log("\nPOST /api/leads — widget capture");
{
  const before = db.leads.length;

  const none = await postLead();
  check("no widget key → 400", none.status === 400);
  const unknown = await postLead({ widget_key: "wk_" + "c".repeat(32) });
  check("unknown widget key → 404", unknown.status === 404);
  const inject = await postLead({ widget_key: `${KEY_A}&tenant_id=eq.${TENANT_B}` });
  check("malformed/injected widget key → 400", inject.status === 400);
  const numeric = await postLead({ widget_key: 12345 });
  check("non-string widget key → 400", numeric.status === 400);
  check("none of the rejected submissions stored anything", db.leads.length === before);

  const ok = await postLead({ widget_key: KEY_A });
  check("valid key → 201", ok.status === 201);
  const stored = db.leads[db.leads.length - 1];
  check("stored row carries company A's tenant_id", stored.tenant_id === TENANT_A);

  const spoof = await postLead({ widget_key: KEY_A, tenant_id: TENANT_B, tenantId: TENANT_B });
  check("spoofed tenant_id in the body is ignored", spoof.status === 201 && db.leads[db.leads.length - 1].tenant_id === TENANT_A);

  const bKey = await postLead({ widget_key: KEY_B, name: "Brand New B-Lead" });
  check("company B's key files under company B", bKey.status === 201 && db.leads[db.leads.length - 1].tenant_id === TENANT_B);

  const aAfter = await names(await getLeads(bearer("tok_a")));
  const bAfter = await names(await getLeads(bearer("tok_b")));
  check("new widget leads show up for A only where they belong", !aAfter.includes("Brand New B-Lead") && aAfter.includes("Visitor Person"));
  check("…and for B only where they belong", bAfter.includes("Brand New B-Lead") && !bAfter.some((n) => n === "Visitor Person"));

  const preflightHeaders = ok.headers.get("access-control-allow-origin");
  check("public POST stays callable cross-origin (widget still works)", preflightHeaders === "*");
}

/* -------------------------------------------------------------------------- */
/* 5. The storage layer itself refuses unscoped access                         */
/* -------------------------------------------------------------------------- */
console.log("\nleads-core — no unscoped access exists");
{
  const rejects = async (fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };
  check("listLeads() with no tenant throws", await rejects(() => (listLeads as unknown as (t?: string) => Promise<unknown>)()));
  check("listLeads('') throws", await rejects(() => listLeads("")));
  check("listLeads(non-uuid) throws", await rejects(() => listLeads("*")));
  check("listLeads(filter-injection string) throws", await rejects(() => listLeads(`${TENANT_A}&or=(tenant_id.is.null)`)));

  const lead = { name: "X Y", phone: "5551234567", email: null, zip_code: "75001", roofing_need: "leak", consent: true as const, consent_text: "ok", conversation: [] };
  const before = db.leads.length;
  check(
    "insertLead() without a tenant throws and writes nothing",
    (await rejects(() => insertLead(lead, { tenantId: "", userAgent: null, score: 1 }))) && db.leads.length === before
  );
}

globalThis.fetch = originalFetch;
console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exit(1);
