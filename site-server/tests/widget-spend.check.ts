export {};
/**
 * AI spend cap — offline checks.
 * ---------------------------------------------------------------------------
 * Runs the REAL /api/widget-reply handler against an in-memory fake of Supabase
 * and Groq. The number that matters is `groqCalls`: every one is real money.
 *
 * Run (from site-server/):
 *   node --experimental-strip-types --import ../tests/register-ts.mjs tests/widget-spend.check.ts
 */
process.env.SUPABASE_URL = "https://fake-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake_service_key_for_offline_tests";
process.env.GROQ_API_KEY = "fake_groq_key";

const { handleWidgetReplyPost } = await import("../src/lib/widget-reply-handler.ts");

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log("  ✅", name); } else { fail++; console.log("  ❌", name); }
};

const TENANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const TENANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const KEY_A = "wk_" + "a".repeat(32);
const KEY_B = "wk_" + "b".repeat(32);
const TENANTS: Record<string, string> = { [KEY_A]: TENANT_A, [KEY_B]: TENANT_B };

/* ---- fake world ---------------------------------------------------------- */
let groqCalls = 0;
let dbCalls = 0;
let limiterBroken = false;
let groqStatus = 200;
const counters = new Map<string, number>();
const reset = () => { groqCalls = 0; dbCalls = 0; limiterBroken = false; groqStatus = 200; counters.clear(); };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

  if (url.hostname === "api.groq.com") {
    groqCalls++;
    return groqStatus === 200
      ? reply({ choices: [{ message: { content: "Sorry to hear that! What is your ZIP code?" } }] })
      : reply({ error: "boom" }, groqStatus);
  }

  dbCalls++;
  if (url.pathname === "/rest/v1/tenants") {
    const key = (url.searchParams.get("widget_key") ?? "").replace(/^eq\./, "");
    const id = TENANTS[key];
    return reply(id ? [{ id }] : []);
  }
  if (url.pathname === "/rest/v1/rpc/hit_rate_limit") {
    if (limiterBroken) return reply({ message: "db down" }, 500);
    const b = JSON.parse(String(init?.body)) as { p_key: string; p_limit: number };
    const n = (counters.get(b.p_key) ?? 0) + 1;
    counters.set(b.p_key, n);
    return reply(n <= b.p_limit); // same behaviour as the real function
  }
  return reply({ message: "not found" }, 404);
}) as typeof fetch;

let ipN = 0;
const ask = (over: Record<string, unknown> = {}, ip?: string) =>
  handleWidgetReplyPost(
    new Request("https://site.test/api/widget-reply", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip ?? `10.1.0.${String(++ipN)}` },
      body: JSON.stringify({ messages: [{ role: "user", content: "My roof: water leak" }], widget_key: KEY_A, ...over }),
    })
  );
const json = async (r: Response) => (await r.json()) as { fallback?: boolean; reply?: string; error?: string };

/* ---- 1. nothing is spent without a real contractor ------------------------ */
console.log("\n1. no real contractor → no AI spend");
{
  reset();
  let r = await ask({ widget_key: undefined });
  check("no widget key → scripted fallback, 200", r.status === 200 && (await json(r)).fallback === true);
  r = await ask({ widget_key: "wk_nonsense" });
  check("malformed key → fallback", (await json(r)).fallback === true);
  r = await ask({ widget_key: `${KEY_A}&x=1` });
  check("injected key → fallback", (await json(r)).fallback === true);
  r = await ask({ widget_key: "wk_" + "c".repeat(32) });
  check("unknown key → fallback", (await json(r)).fallback === true);
  check("the paid AI was NEVER called", groqCalls === 0);
}

/* ---- 2. a real contractor gets the real AI -------------------------------- */
console.log("\n2. valid contractor → AI works");
{
  reset();
  const r = await ask();
  const b = await json(r);
  check("valid key → live AI reply", r.status === 200 && b.fallback === false && Boolean(b.reply));
  check("exactly one paid call", groqCalls === 1);
  check("public endpoint stays callable cross-origin", r.headers.get("access-control-allow-origin") === "*");
}

/* ---- 3. per-IP cap --------------------------------------------------------- */
console.log("\n3. one visitor cannot hammer it");
{
  reset();
  process.env.WIDGET_AI_IP_MAX = "3";
  const codes: number[] = [];
  for (let i = 0; i < 10; i++) codes.push((await ask({}, "9.9.9.9")).status);
  check("first 3 allowed, the rest get 429", codes.slice(0, 3).every((c) => c === 200) && codes.slice(3).every((c) => c === 429));
  check("only 3 paid calls out of 10 requests", groqCalls === 3);
  const blocked = await ask({}, "9.9.9.9");
  check("blocked response still lets the widget carry on (fallback)", (await json(blocked)).fallback === true);
  check("blocked response tells the client when to retry", Number(blocked.headers.get("retry-after")) > 0);
  delete process.env.WIDGET_AI_IP_MAX;
}

/* ---- 4. per-company cap: fake IPs cannot get around it --------------------- */
console.log("\n4. rotating fake IPs does not help");
{
  reset();
  process.env.WIDGET_AI_TENANT_DAILY = "5";
  const statuses: number[] = [];
  for (let i = 0; i < 20; i++) statuses.push((await ask({ widget_key: KEY_A })).status); // a NEW ip every time
  check("company A is cut off after its daily cap", statuses.filter((s) => s === 200).length === 5);
  check("only 5 paid calls out of 20 requests", groqCalls === 5);
  const b = await ask({ widget_key: KEY_B });
  check("company B is not affected by company A's cap", b.status === 200 && groqCalls === 6);
  delete process.env.WIDGET_AI_TENANT_DAILY;
}

/* ---- 5. global ceiling ------------------------------------------------------ */
console.log("\n5. absolute ceiling for the whole product");
{
  reset();
  process.env.WIDGET_AI_GLOBAL_DAILY = "7";
  for (let i = 0; i < 12; i++) await ask({ widget_key: i % 2 ? KEY_A : KEY_B });
  check("total paid calls never exceed the global cap", groqCalls === 7);
  delete process.env.WIDGET_AI_GLOBAL_DAILY;
}

/* ---- 6. blocked requests don't burn later counters --------------------------- */
console.log("\n6. cheap checks come first");
{
  reset();
  process.env.WIDGET_AI_IP_MAX = "2";
  for (let i = 0; i < 8; i++) await ask({}, "7.7.7.7");
  check("global counter == paid calls (IP-blocked requests never reach it)", counters.get("widgetai:global") === groqCalls && groqCalls === 2);
  delete process.env.WIDGET_AI_IP_MAX;
}

/* ---- 7. fails CLOSED ---------------------------------------------------------- */
console.log("\n7. if the counters break, the AI stays OFF");
{
  reset();
  limiterBroken = true;
  const r = await ask();
  check("limiter error → 503 + scripted fallback", r.status === 503 && (await json(r)).fallback === true);
  check("the paid AI was NOT called", groqCalls === 0);

  reset();
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const r2 = await ask();
  check("database not configured → fallback, no AI", (await json(r2)).fallback === true && groqCalls === 0);
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
}

/* ---- 8. abuse + housekeeping ---------------------------------------------------- */
console.log("\n8. abuse and edge cases");
{
  reset();
  const big = await ask({ messages: [{ role: "user", content: "x".repeat(30_000) }] });
  check("oversized body → 413, nothing called", big.status === 413 && groqCalls === 0 && dbCalls === 0);
  const bad = await handleWidgetReplyPost(new Request("https://site.test/api/widget-reply", { method: "POST", body: "{nope" }));
  check("bad JSON → 400", bad.status === 400);
  const empty = await ask({ messages: [] });
  check("no messages → 400, nothing spent", empty.status === 400 && groqCalls === 0);

  reset();
  groqStatus = 500;
  const down = await ask();
  check("AI provider outage → scripted fallback, not an error", down.status === 200 && (await json(down)).fallback === true);

  reset();
  delete process.env.GROQ_API_KEY;
  const noKey = await ask();
  check("no AI key configured → fallback, limiter untouched", (await json(noKey)).fallback === true && counters.size === 0);
  process.env.GROQ_API_KEY = "fake_groq_key";
}

globalThis.fetch = originalFetch;
console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exit(1);
