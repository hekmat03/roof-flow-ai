/**
 * leads-auth.check.ts — regression test for audit finding C1.
 * ---------------------------------------------------------------------------
 * `GET /api/leads` used to return the 200 most recent homeowners (name, phone,
 * email, ZIP, chat transcript) to ANY caller: there was no session check, and
 * `isSameOrigin()` returned true when the Origin header was absent, so a plain
 * `curl` received the whole table.
 *
 * These checks drive the real handler (`handleListLeads`) with a stubbed
 * `fetch`, so they run offline and can assert BOTH the rejection and the fact
 * that the database was never queried.
 *
 * Run from the repo root:
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *     site-server/tests/leads-auth.check.ts
 */
export {};

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    console.log("  ❌", name, detail);
  }
};

// A fake-but-complete Supabase config: without it `dbConfigured()` would be
// false and a 503 could mask a missing auth check. The service key is also the
// HMAC key the session cookie is signed with, so a session can be minted here.
process.env.SUPABASE_URL = "https://supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_role_key_for_offline_checks";

const { createSessionToken, SESSION_COOKIE } = await import("../src/lib/auth.ts");
const { isSameOrigin } = await import("../src/lib/http.ts");
const { handleListLeads } = await import("../src/lib/leads-list.ts");
const { LEAD_LIST_COLUMNS } = await import("../src/lib/leads-core.ts");

const SITE = "https://app.example.test";
const LIST_URL = `${SITE}/api/leads`;

/* -------------------------------------------------------------------------- */
/* fetch stub: records calls, never touches the network                        */
/* -------------------------------------------------------------------------- */

const ROW = {
  id: "0b9c1f7e-0000-4000-8000-000000000001",
  name: "Ada Homeowner",
  phone: "+10000000000",
  email: "ada@example.test",
  zip_code: "12345",
  roofing_need: "Hail damage",
  consent: true,
  consent_text: "I agree to be contacted.",
  conversation: [{ sender: "visitor", text: "hi", timestamp: "2026-01-01T00:00:00Z" }],
  lead_score: 80,
  status: "New Lead",
  source: "Website Widget",
  created_at: "2026-01-01T00:00:00Z",
  user_agent: "stub-agent/1.0",
};

const realFetch = globalThis.fetch;
const fetchCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCalls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  return new Response(JSON.stringify([ROW]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const get = (headers: Record<string, string> = {}) =>
  new Request(LIST_URL, { method: "GET", headers: { accept: "application/json", ...headers } });

const cookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` });

const validToken = createSessionToken("11111111-1111-4111-8111-111111111111", "owner@example.test");
const body = (res: Response) => res.json() as Promise<Record<string, unknown>>;

/* -------------------------------------------------------------------------- */
/* [1] unauthenticated GET is rejected — the regression                       */
/* -------------------------------------------------------------------------- */
console.log("\n[1] unauthenticated GET /api/leads");

// This is the exact request the audit made with curl: no Origin, no cookie.
const anon = await handleListLeads(get());
const anonBody = await body(anon);
check("no cookie → 401", anon.status === 401, `got ${String(anon.status)}`);
check("no cookie → error=not_authenticated", anonBody.error === "not_authenticated", JSON.stringify(anonBody));
check("no cookie → no lead rows in the body", !("leads" in anonBody) && !("count" in anonBody), JSON.stringify(anonBody));
check("no cookie → database never queried", fetchCalls.length === 0, `fetch calls: ${String(fetchCalls.length)}`);

const forged = await handleListLeads(get(cookie("eyJ1c2VySWQiOiJ4In0.forged-signature")));
check("forged cookie → 401", forged.status === 401, `got ${String(forged.status)}`);

const noMac = await handleListLeads(get(cookie(validToken.split(".")[0] ?? "")));
check("cookie with the signature stripped → 401", noMac.status === 401, `got ${String(noMac.status)}`);
check("rejected requests never reached the database", fetchCalls.length === 0, `fetch calls: ${String(fetchCalls.length)}`);

// A tampered payload with the original MAC must not pass either.
const [payload, mac] = validToken.split(".");
const tamperedPayload = Buffer.from(
  JSON.stringify({ userId: "attacker", email: "a@b.test", exp: Math.floor(Date.now() / 1000) + 3600 })
).toString("base64url");
const tampered = await handleListLeads(get(cookie(`${tamperedPayload}.${mac ?? ""}`)));
check("tampered payload re-using a valid signature → 401", tampered.status === 401, `got ${String(tampered.status)}`);
check("tampered session payload is not trusted", payload !== tamperedPayload && fetchCalls.length === 0);

/* -------------------------------------------------------------------------- */
/* [2] the Origin header is not authentication                                */
/* -------------------------------------------------------------------------- */
console.log("\n[2] same-origin gate is CSRF defence, not auth");

check("missing Origin is NOT same-origin by default (C1)", isSameOrigin(get()) === false);
check(
  "missing Origin can be opted into explicitly (browser GET)",
  isSameOrigin(get(), { allowMissingOrigin: true }) === true
);
check("a foreign Origin is rejected", isSameOrigin(get({ origin: "https://evil.example" })) === false);
check("the site's own Origin is accepted", isSameOrigin(get({ origin: SITE, host: "app.example.test" })) === true);
check("an opaque Origin is rejected", isSameOrigin(get({ origin: "null" })) === false);

// An unauthenticated caller sending a perfectly good Origin still gets nothing.
const sameOriginAnon = await handleListLeads(get({ origin: SITE, host: "app.example.test" }));
check("authenticated-less request from the right Origin → still 401", sameOriginAnon.status === 401);

/* -------------------------------------------------------------------------- */
/* [3] a signed-in caller gets data — allowlisted, never `select=*`           */
/* -------------------------------------------------------------------------- */
console.log("\n[3] authenticated GET returns the allowlist only");

const authed = await handleListLeads(get(cookie(validToken)));
const authedBody = (await body(authed)) as { ok?: boolean; leads?: unknown[]; count?: number };
check("valid session → 200", authed.status === 200, `got ${String(authed.status)}`);
check("valid session → one row returned", authedBody.count === 1 && authedBody.leads?.length === 1);
check("valid session → the database was queried once", fetchCalls.length === 1, `fetch calls: ${String(fetchCalls.length)}`);

const query = fetchCalls[0] ?? "";
const decoded = decodeURIComponent(query);
check("query uses an explicit select list", /[?&]select=[a-z_,]+(&|$)/.test(decoded), query);
check("query is NOT select=*", !/[?&]select=\*/.test(decoded), query);
check("query does not request user_agent", !/user_agent/.test(decoded), query);
check(
  "every allowlisted column is requested",
  LEAD_LIST_COLUMNS.every((column) => decoded.includes(column)),
  decoded
);
check("query is still ordered newest-first and limited", /order=created_at\.desc/.test(decoded) && /limit=200/.test(decoded), decoded);

const foreignAuthed = await handleListLeads(get({ ...cookie(validToken), origin: "https://evil.example" }));
check("valid session but foreign Origin → 403", foreignAuthed.status === 403, `got ${String(foreignAuthed.status)}`);
check("the 403 did not reach the database", fetchCalls.length === 1);

/* -------------------------------------------------------------------------- */

globalThis.fetch = realFetch;

console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exit(1);
console.log("ALL LEADS AUTH CHECKS PASSED");
