/**
 * Usage accounting + plan enforcement — offline unit checks.
 * ---------------------------------------------------------------------------
 * These exercise the REAL `src/lib/usage.ts` code against an in-memory
 * PostgREST fake (a stubbed global `fetch`), so the invariants the product
 * relies on are proven without a database, a network call or a real account:
 *
 *   - one conversation = one row, and a unique (user_id, conversation_id) key
 *     makes a replay free even when two requests arrive at once
 *   - the quota check runs before the work, and an over-quota attempt leaves
 *     no trace (the claimed row is rolled back)
 *   - a failed request hands the charge back (releaseConversation)
 *   - missing storage never claims a conversation was counted
 *   - the cached counter is only ever a mirror of the authoritative rows
 *
 * Run: bun run tests/usage.check.ts   (from the site dir)
 */
process.env.SUPABASE_URL = "https://fake-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake_service_key_for_offline_tests";
// Declared before the module import so `isConfigured()` sees them.
const { periodStart, periodEnd, consumeConversation, releaseConversation, usageSnapshot } = await import(
  "../src/lib/usage.ts"
);
const { limitForPlan } = await import("../src/lib/plans.ts");

/* -------------------------------------------------------------------------- */
/* In-memory PostgREST fake                                                    */
/* -------------------------------------------------------------------------- */
const USER = "11111111-2222-3333-4444-555555555555";
const PERIOD = periodStart();

type ConvRow = { user_id: string; conversation_id: string; period_start: string };
type UsageRow = { user_id: string; period_start: string; conversations_used: number };

const db = {
  profiles: [{ user_id: USER, current_plan: "free", subscription_status: "none" }],
  usage_conversations: [] as ConvRow[],
  usage: [] as UsageRow[],
};

/** When true, the usage tables answer like a project without the migration. */
let tablesMissing = false;
let calls = 0;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const eq = (params: URLSearchParams, key: string): string | null => {
  const raw = params.get(key);
  return raw?.startsWith("eq.") ? decodeURIComponent(raw.slice(3)) : null;
};

const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  calls++;
  const url = new URL(String(input));
  const table = url.pathname.replace("/rest/v1/", "");
  const p = url.searchParams;
  const method = (init?.method ?? "GET").toUpperCase();

  if (table === "usage_conversations" || table === "usage") {
    if (tablesMissing) {
      return json(
        { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` },
        404
      );
    }
  }

  if (table === "profiles" && method === "GET") {
    const row = db.profiles.find((r) => r.user_id === eq(p, "user_id"));
    return json(row ? [row] : []);
  }

  if (table === "usage_conversations") {
    const userId = eq(p, "user_id");
    const period = eq(p, "period_start");
    const conversationId = eq(p, "conversation_id");

    if (method === "GET") {
      const rows = db.usage_conversations.filter(
        (r) => (userId === null || r.user_id === userId) && (period === null || r.period_start === period)
      );
      // PostgREST answers with content-range even when the body is truncated.
      return json(rows.slice(0, 1), 206, { "content-range": `0-0/${String(rows.length)}` });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as ConvRow;
      const clash = db.usage_conversations.some(
        (r) => r.user_id === body.user_id && r.conversation_id === body.conversation_id
      );
      if (clash) {
        return json(
          {
            code: "23505",
            message: "duplicate key value violates unique constraint \"usage_conversations_pkey\"",
          },
          409
        );
      }
      db.usage_conversations.push({ ...body });
      return new Response(null, { status: 201 });
    }

    if (method === "DELETE") {
      db.usage_conversations = db.usage_conversations.filter(
        (r) =>
          !(
            (userId === null || r.user_id === userId) &&
            (conversationId === null || r.conversation_id === conversationId)
          )
      );
      return new Response(null, { status: 204 });
    }
  }

  if (table === "usage") {
    const userId = eq(p, "user_id");
    const period = eq(p, "period_start");

    if (method === "GET") {
      const row = db.usage.find((r) => r.user_id === userId && r.period_start === period);
      return json(row ? [row] : []);
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as UsageRow;
      const existing = db.usage.find(
        (r) => r.user_id === body.user_id && r.period_start === body.period_start
      );
      if (existing) existing.conversations_used = body.conversations_used;
      else db.usage.push({ ...body });
      return new Response(null, { status: 201 });
    }
  }

  return json({ message: "unexpected request in offline fake", table, method }, 400);
};
globalThis.fetch = fakeFetch as unknown as typeof fetch;

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */
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
const rows = () => db.usage_conversations.length;
const cached = () => db.usage[0]?.conversations_used ?? null;
const reset = () => {
  db.usage_conversations = [];
  db.usage = [];
  tablesMissing = false;
};

const LIMIT = limitForPlan("free");

/* -------------------------------------------------------------------------- */
/* 1. Billing period math                                                      */
/* -------------------------------------------------------------------------- */
console.log("\n1. Billing period (UTC month)");
check("first of the current month is YYYY-MM-01", /^\d{4}-\d{2}-01$/.test(PERIOD), PERIOD);
check(
  "mid-month keeps the same period",
  periodStart(new Date("2026-03-17T23:59:59Z")) === "2026-03-01",
  periodStart(new Date("2026-03-17T23:59:59Z"))
);
check(
  "January 1st (a month boundary) is the 1st",
  periodStart(new Date("2026-01-01T00:00:00Z")) === "2026-01-01"
);
check("period end is the next 1st", periodEnd("2026-03-01") === "2026-04-01", periodEnd("2026-03-01"));
check("December rolls over the year", periodEnd("2026-12-01") === "2027-01-01", periodEnd("2026-12-01"));

/* -------------------------------------------------------------------------- */
/* 2. One conversation = one row                                               */
/* -------------------------------------------------------------------------- */
console.log("\n2. Counting a conversation");
reset();
const first = await consumeConversation({ userId: USER, conversationId: "conv-a" });
check("first conversation is allowed", first.allowed === true);
check("first conversation is counted", first.counted === true && first.duplicate === false);
check("used is 1 and the limit is the Free allowance", first.used === 1 && first.limit === LIMIT, `${String(first.used)}/${String(first.limit)}`);
check("exactly one unique row exists", rows() === 1, String(rows()));
check("cached counter mirrors the rows", cached() === 1, String(cached()));

/* -------------------------------------------------------------------------- */
/* 3. Replay is free (the no-double-count guarantee)                           */
/* -------------------------------------------------------------------------- */
console.log("\n3. Replay / concurrency");
const replay = await consumeConversation({ userId: USER, conversationId: "conv-a" });
check("replay is still allowed", replay.allowed === true);
check("replay is not counted again", replay.counted === false && replay.duplicate === true);
check("used stays at 1", replay.used === 1, String(replay.used));
check("no second row was written", rows() === 1, String(rows()));

const sameThreadTwice = await Promise.all([
  consumeConversation({ userId: USER, conversationId: "conv-race" }),
  consumeConversation({ userId: USER, conversationId: "conv-race" }),
]);
check(
  "two simultaneous requests for one thread charge it once",
  sameThreadTwice.filter((r) => r.counted).length === 1 && rows() === 2,
  `${String(sameThreadTwice.filter((r) => r.counted).length)} counted / ${String(rows())} rows`
);

/* -------------------------------------------------------------------------- */
/* 4. Quota is enforced, and an over-quota attempt leaves no trace             */
/* -------------------------------------------------------------------------- */
console.log("\n4. Quota enforcement");
reset();
for (let i = 0; i < LIMIT; i++) await consumeConversation({ userId: USER, conversationId: `fill-${String(i)}` });
const atLimit = await consumeConversation({ userId: USER, conversationId: "one-too-many" });
check(`the ${String(LIMIT)}th conversation was within the Free plan`, rows() === LIMIT, String(rows()));
check("the next one is refused", atLimit.allowed === false, JSON.stringify(atLimit));
check("a refused conversation is not counted", atLimit.counted === false);
check("the refusal reports used = limit", atLimit.used === LIMIT && atLimit.remaining === 0);
check("the refused attempt left no row behind", rows() === LIMIT, String(rows()));

/* -------------------------------------------------------------------------- */
/* 5. A failed request hands the charge back                                   */
/* -------------------------------------------------------------------------- */
console.log("\n5. Release on failure");
await releaseConversation(USER, "fill-0");
check("release removes the row", rows() === LIMIT - 1, String(rows()));
check("the cached counter follows the rows down", cached() === LIMIT - 1, String(cached()));
const afterRelease = await consumeConversation({ userId: USER, conversationId: "after-release" });
check("the freed slot can be used again", afterRelease.allowed === true && afterRelease.counted === true);
check("used is back at the limit, never above it", afterRelease.used === LIMIT, String(afterRelease.used));
const snapshot = await usageSnapshot(USER);
check("the snapshot agrees with the rows", snapshot.used === rows(), `${String(snapshot.used)} vs ${String(rows())}`);
check("the snapshot reports healthy storage", snapshot.storage === "ok" && snapshot.degraded === false);

/* -------------------------------------------------------------------------- */
/* 6. Missing storage never claims a conversation was counted                  */
/* -------------------------------------------------------------------------- */
console.log("\n6. Degraded storage");
reset();
tablesMissing = true;
const missing = await consumeConversation({ userId: USER, conversationId: "conv-x" });
check("no storage means not allowed", missing.allowed === false);
check("no storage means nothing was counted", missing.counted === false && missing.used === 0);
check("the reason is reported as table_missing", missing.storage === "table_missing", missing.storage);
const missingSnap = await usageSnapshot(USER);
check("the snapshot is marked degraded", missingSnap.degraded === true && missingSnap.storage === "table_missing");
tablesMissing = false;

/* -------------------------------------------------------------------------- */
/* 7. No credentials at all                                                    */
/* -------------------------------------------------------------------------- */
console.log("\n7. Not configured");
reset();
delete process.env.SUPABASE_URL;
const before = calls;
const notConfigured = await usageSnapshot(USER);
check("an unconfigured project is reported, not guessed", notConfigured.storage === "not_configured");
check("no network call was attempted", calls === before, `${String(calls - before)} calls`);
process.env.SUPABASE_URL = "https://fake-project.supabase.co";

/* -------------------------------------------------------------------------- */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
