export {};
/**
 * Lemon Squeezy webhook — offline unit checks.
 * ---------------------------------------------------------------------------
 * A fake secret, locally computed HMACs and an in-memory `ProfilesStore`: no
 * Lemon Squeezy account, no network, no database, no real key anywhere.
 *
 * Run: bun run tests/lemon.check.ts   (from the site dir)
 */
import { createHmac } from "node:crypto";

const SECRET = "whsec_offline_test_secret";
const VARIANT_STARTER = "1001";
const VARIANT_PRO = "2002";
const BUY_STARTER = "https://shop.lemonsqueezy.com/checkout/buy/starter-offline";
const BUY_PRO = "https://shop.lemonsqueezy.com/checkout/buy/pro-offline";

const ENV_KEYS = [
  "LS_WEBHOOK_SECRET",
  "LS_VARIANT_STARTER",
  "LS_VARIANT_PRO",
  "LS_CHECKOUT_URL_STARTER",
  "LS_CHECKOUT_URL_PRO",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const savedEnv = new Map<string, string | undefined>(ENV_KEYS.map((k) => [k, process.env[k]]));
const clearEnv = () => {
  for (const k of ENV_KEYS) delete process.env[k];
};
const fullEnv = () => {
  process.env.LS_WEBHOOK_SECRET = SECRET;
  process.env.LS_VARIANT_STARTER = VARIANT_STARTER;
  process.env.LS_VARIANT_PRO = VARIANT_PRO;
  process.env.LS_CHECKOUT_URL_STARTER = BUY_STARTER;
  process.env.LS_CHECKOUT_URL_PRO = BUY_PRO;
};
const restoreEnv = () => {
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

const lemon = await import("../src/lib/lemon.ts");
const { handleLemonWebhook, applyLemonEvent, validSignature, entitlement, planFromVariant, buildCheckoutLink, checkoutUrlForPlan, lemonPaymentsActivated, isSupersededEvent, effectivePlan } = lemon;
type Store = import("../src/lib/lemon.ts").ProfilesStore;
type Event = import("../src/lib/lemon.ts").LemonEvent;

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

/** Sign a body exactly the way Lemon Squeezy does. */
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");

const U1 = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-11-04T12:00:00Z");
const FUTURE = "2026-12-04T12:00:00Z";
const PAST = "2026-10-01T12:00:00Z";

type Row = Record<string, unknown>;

/** In-memory stand-in for the PostgREST store (only what lemon.ts touches). */
const fakeStore = (rows: Row[], opts: { failWrite?: boolean } = {}) => {
  const calls: { reads: number; writes: number; lastPatch: Row | null } = { reads: 0, writes: 0, lastPatch: null };
  const store: Store = {
    findUserIdByEmail: async (email) => {
      const hit = rows.find((r) => String(r.email ?? "").toLowerCase() === email.toLowerCase());
      return (hit?.user_id as string | undefined) ?? null;
    },
    readState: async (userId) => {
      calls.reads++;
      const hit = rows.find((r) => r.user_id === userId);
      if (!hit) return null;
      return {
        ls_updated_at: (hit.ls_updated_at as string | null) ?? null,
        ls_subscription_id: (hit.ls_subscription_id as string | null) ?? null,
        current_plan: (hit.current_plan as string | null) ?? null,
        subscription_status: (hit.subscription_status as string | null) ?? null,
        current_period_end: (hit.current_period_end as string | null) ?? null,
      };
    },
    writePlan: async (userId, patch) => {
      calls.writes++;
      calls.lastPatch = patch;
      if (opts.failWrite) return { updated: 0, error: "500 db down" };
      const hit = rows.filter((r) => r.user_id === userId);
      hit.forEach((r) => Object.assign(r, patch));
      return { updated: hit.length, error: null };
    },
  };
  return { store, rows, calls };
};

const profileRow = (over: Row = {}): Row => ({
  user_id: U1,
  email: "owner@example.com",
  current_plan: "free",
  subscription_status: "none",
  ls_subscription_id: null,
  ls_updated_at: null,
  current_period_end: null,
  ...over,
});

const attrs = (over: Row = {}): Row => ({
  status: "active",
  variant_id: Number(VARIANT_STARTER),
  customer_id: 77,
  user_email: "owner@example.com",
  renews_at: FUTURE,
  ends_at: null,
  cancelled: false,
  urls: { customer_portal: "https://store.lemonsqueezy.com/billing/abc" },
  updated_at: "2026-11-04T11:00:00Z",
  ...over,
});

const event = (name: string, a: Row, o: { subId?: string; userId?: string | null } = {}): Event => ({
  meta: { event_name: name, custom_data: o.userId === null ? {} : { user_id: o.userId ?? U1 } },
  data: { id: o.subId ?? "sub_A", attributes: a },
});

const body = (evt: Event) => JSON.stringify(evt);

// ---------------------------------------------------------------------------
console.log("\n[1] configuration");
clearEnv();
check("payments OFF with no env at all", lemonPaymentsActivated() === false);
process.env.LS_WEBHOOK_SECRET = SECRET;
process.env.LS_CHECKOUT_URL_STARTER = BUY_STARTER;
process.env.LS_CHECKOUT_URL_PRO = BUY_PRO;
check("payments OFF without variant ids (a buyer could never be upgraded)", lemonPaymentsActivated() === false);
fullEnv();
check("payments ON with secret + both variant ids + both buy links", lemonPaymentsActivated() === true);
process.env.LS_CHECKOUT_URL_PRO = "http://insecure.example/p";
check("a non-https buy link is refused", checkoutUrlForPlan("pro") === null && lemonPaymentsActivated() === false);
fullEnv();
check("free plan has no buy link", checkoutUrlForPlan("free") === null);
check("variant 1001 -> starter (number or string)", planFromVariant(VARIANT_STARTER) === "starter" && planFromVariant(Number(VARIANT_STARTER)) === "starter");
check("variant 2002 -> pro", planFromVariant(VARIANT_PRO) === "pro");
check("unknown / empty variant -> null", planFromVariant("9999") === null && planFromVariant("") === null && planFromVariant(undefined) === null);

// ---------------------------------------------------------------------------
console.log("\n[2] signature (HMAC-SHA256 over the RAW body, constant-time compare)");
const rawBody = JSON.stringify({ hello: "world" });
const goodSig = sign(rawBody);
check("valid signature accepted", validSignature(Buffer.from(rawBody), goodSig, SECRET));
check("valid signature accepted for a string body", validSignature(rawBody, goodSig, SECRET));
check("wrong secret rejected", !validSignature(Buffer.from(rawBody), goodSig, "other_secret"));
check("tampered body rejected", !validSignature(Buffer.from('{"hello":"w0rld"}'), goodSig, SECRET));
check("missing header rejected", !validSignature(Buffer.from(rawBody), null, SECRET));
check("empty secret rejected", !validSignature(Buffer.from(rawBody), goodSig, ""));
check("non-hex header rejected", !validSignature(Buffer.from(rawBody), "zzzz-not-hex", SECRET));
check("truncated header rejected", !validSignature(Buffer.from(rawBody), goodSig.slice(0, 10), SECRET));
check("uppercase hex still verifies", validSignature(Buffer.from(rawBody), goodSig.toUpperCase(), SECRET));

// ---------------------------------------------------------------------------
console.log("\n[3] entitlement rules");
const base = attrs();
check("active starter -> starter", entitlement(base, NOW) === "starter");
check("active pro -> pro", entitlement(attrs({ variant_id: Number(VARIANT_PRO) }), NOW) === "pro");
check("on_trial keeps the plan", entitlement(attrs({ status: "on_trial" }), NOW) === "starter");
check("past_due keeps access while the card is retried", entitlement(attrs({ status: "past_due" }), NOW) === "starter");
check("cancelled, period not over -> still paid", entitlement(attrs({ status: "cancelled", ends_at: FUTURE }), NOW) === "starter");
check("cancelled, period over -> free", entitlement(attrs({ status: "cancelled", ends_at: PAST }), NOW) === "free");
check("cancelled with no end date -> free", entitlement(attrs({ status: "cancelled", ends_at: null }), NOW) === "free");
check("expired -> free", entitlement(attrs({ status: "expired" }), NOW) === "free");
check("unpaid -> free", entitlement(attrs({ status: "unpaid" }), NOW) === "free");
check("paused -> free", entitlement(attrs({ status: "paused" }), NOW) === "free");
check("unknown status -> free (fail closed)", entitlement(attrs({ status: "weird" }), NOW) === "free");
check("active but unmapped variant -> unmapped", entitlement(attrs({ variant_id: 4242 }), NOW) === "unmapped");
check(
  "effectivePlan: cancelled with a future period end still counts as paid",
  effectivePlan({ current_plan: "pro", subscription_status: "cancelled", current_period_end: FUTURE }, NOW) === "pro"
);

// ---------------------------------------------------------------------------
console.log("\n[4] webhook: unconfigured deployment degrades cleanly");
clearEnv();
const noSecret = await handleLemonWebhook(Buffer.from(body(event("subscription_created", base))), sign(body(event("subscription_created", base))));
check("no LS_WEBHOOK_SECRET -> 503 not_configured (never 500, never a crash)", noSecret.status === 503 && noSecret.body.error === "not_configured", JSON.stringify(noSecret));
check("the 503 explains what to set", String(noSecret.body.message ?? "").includes("LS_WEBHOOK_SECRET"));

process.env.LS_WEBHOOK_SECRET = SECRET;
const noDb = await handleLemonWebhook(Buffer.from("{}"), "deadbeef");
check("secret set but no database -> 503 database_not_configured", noDb.status === 503 && noDb.body.error === "database_not_configured", JSON.stringify(noDb));
fullEnv();

// ---------------------------------------------------------------------------
console.log("\n[5] webhook: signature gate");
const created = event("subscription_created", attrs());
const createdBody = body(created);
const validSig = sign(createdBody);
// Every call below injects a store, so this section never touches a database.
const gateStore = () => fakeStore([profileRow()]).store;

const unsigned = await handleLemonWebhook(Buffer.from(createdBody), null, { store: gateStore() });
check("unsigned delivery -> 401 bad_signature", unsigned.status === 401 && unsigned.body.error === "bad_signature", JSON.stringify(unsigned));

const wrongSecretSig = await handleLemonWebhook(Buffer.from(createdBody), sign(createdBody, "whsec_wrong"), { store: gateStore() });
check("signature from the wrong secret -> 401", wrongSecretSig.status === 401, JSON.stringify(wrongSecretSig));

const tamperedBody = createdBody.replace('"status":"active"', '"status":"active","variant_id":2002');
const tamperedStore = fakeStore([profileRow()]);
const tampered = await handleLemonWebhook(Buffer.from(tamperedBody), validSig, { store: tamperedStore.store, now: NOW });
check("a VALID signature over a tampered body -> 401 (bytes are what is signed)", tampered.status === 401, JSON.stringify(tampered));
check("the rejected body never wrote a plan", tamperedStore.calls.writes === 0 && tamperedStore.rows[0].current_plan === "free");

const notJson = await handleLemonWebhook(Buffer.from("not json at all"), sign("not json at all"), { store: gateStore() });
check("garbage body -> 400 bad_json", notJson.status === 400 && notJson.body.error === "bad_json", JSON.stringify(notJson));

const noMeta = await handleLemonWebhook(Buffer.from('{"data":{}}'), sign('{"data":{}}'), { store: gateStore() });
check("JSON with no meta.event_name -> 400 bad_payload", noMeta.status === 400 && noMeta.body.error === "bad_payload", JSON.stringify(noMeta));

const arrayBody = "[]";
const arrayRes = await handleLemonWebhook(Buffer.from(arrayBody), sign(arrayBody), { store: gateStore() });
check("a JSON array -> 400 bad_payload", arrayRes.status === 400 && arrayRes.body.error === "bad_payload", JSON.stringify(arrayRes));

// ---------------------------------------------------------------------------
console.log("\n[6] webhook: subscription_created upgrades the plan");
{
  const { store, rows } = fakeStore([profileRow()]);
  const res = await handleLemonWebhook(Buffer.from(createdBody), validSig, { store, now: NOW });
  check("valid signature -> 200 with the new plan", res.status === 200 && res.body.plan === "starter", JSON.stringify(res));
  check("profiles.current_plan written to starter", rows[0].current_plan === "starter");
  check("subscription_status written", rows[0].subscription_status === "active");
  check("ls_subscription_id + ls_variant_id stored", rows[0].ls_subscription_id === "sub_A" && rows[0].ls_variant_id === VARIANT_STARTER);
  check("portal url stored", rows[0].ls_portal_url === "https://store.lemonsqueezy.com/billing/abc");
  check("cancel_at_period_end is false for an active sub", rows[0].cancel_at_period_end === false);

  const proBody = body(event("subscription_updated", attrs({ variant_id: Number(VARIANT_PRO) })));
  const proRes = await handleLemonWebhook(Buffer.from(proBody), sign(proBody), { store, now: NOW });
  check("an upgrade to Pro is applied", proRes.status === 200 && proRes.body.plan === "pro" && rows[0].current_plan === "pro", JSON.stringify(proRes));
}

// ---------------------------------------------------------------------------
console.log("\n[7] webhook: cancelled subscription downgrades the plan");
{
  const { store, rows } = fakeStore([profileRow({ current_plan: "starter", subscription_status: "active", ls_subscription_id: "sub_A", ls_updated_at: "2026-11-04T11:00:00Z" })]);
  const cancelledBody = body(event("subscription_cancelled", attrs({ status: "cancelled", cancelled: true, ends_at: PAST, updated_at: "2026-11-04T11:30:00Z" })));
  const res = await handleLemonWebhook(Buffer.from(cancelledBody), sign(cancelledBody), { store, now: NOW });
  check("cancelled + period over -> 200 free", res.status === 200 && res.body.plan === "free", JSON.stringify(res));
  check("profiles.current_plan downgraded to free", rows[0].current_plan === "free", JSON.stringify(rows[0]));
  check("subscription_status = cancelled", rows[0].subscription_status === "cancelled");
  check("cancel_at_period_end recorded", rows[0].cancel_at_period_end === true);
}
{
  // A cancellation that lands mid-period must NOT take the plan away.
  const { store, rows } = fakeStore([profileRow({ current_plan: "pro", subscription_status: "active", ls_subscription_id: "sub_A", ls_updated_at: "2026-11-04T11:00:00Z" })]);
  const midBody = body(event("subscription_cancelled", attrs({ status: "cancelled", cancelled: true, variant_id: Number(VARIANT_PRO), ends_at: FUTURE, updated_at: "2026-11-04T11:30:00Z" })));
  const res = await handleLemonWebhook(Buffer.from(midBody), sign(midBody), { store, now: NOW });
  check("cancelled but paid-through date is in the future -> plan kept", res.status === 200 && rows[0].current_plan === "pro", JSON.stringify(res));
}
{
  const { store, rows } = fakeStore([profileRow({ current_plan: "pro", subscription_status: "active", ls_subscription_id: "sub_A" })]);
  const expiredBody = body(event("subscription_expired", attrs({ status: "expired", updated_at: "2026-11-04T11:30:00Z" })));
  const res = await handleLemonWebhook(Buffer.from(expiredBody), sign(expiredBody), { store, now: NOW });
  check("subscription_expired -> free", res.status === 200 && res.body.plan === "free" && rows[0].current_plan === "free", JSON.stringify(res));
}

// ---------------------------------------------------------------------------
console.log("\n[8] webhook: unmapped variant is handled, not guessed");
{
  const { store, rows, calls } = fakeStore([profileRow()]);
  const unmappedBody = body(event("subscription_created", attrs({ variant_id: 4242 })));
  const res = await handleLemonWebhook(Buffer.from(unmappedBody), sign(unmappedBody), { store, now: NOW });
  check("unmapped variant -> 200 ignored (no retry storm)", res.status === 200 && res.body.ignored === "unmapped_variant", JSON.stringify(res));
  check("nothing was written for an unmapped variant", calls.writes === 0 && rows[0].current_plan === "free");
}
{
  // A mapped variant only counts when the env actually names it.
  const { store, rows } = fakeStore([profileRow()]);
  const saved = process.env.LS_VARIANT_PRO;
  delete process.env.LS_VARIANT_PRO;
  const proBody = body(event("subscription_created", attrs({ variant_id: Number(VARIANT_PRO) })));
  const res = await handleLemonWebhook(Buffer.from(proBody), sign(proBody), { store, now: NOW });
  if (saved !== undefined) process.env.LS_VARIANT_PRO = saved;
  check("LS_VARIANT_PRO missing -> that variant is unmapped (never a silent upgrade)", res.status === 200 && res.body.ignored === "unmapped_variant" && rows[0].current_plan === "free", JSON.stringify(res));
}

// ---------------------------------------------------------------------------
console.log("\n[9] webhook: identity, ordering and failure handling");
{
  const { store, rows } = fakeStore([profileRow()]);
  const noUser = body(event("subscription_created", attrs({ user_email: "stranger@example.com" }), { userId: null }));
  const res = await handleLemonWebhook(Buffer.from(noUser), sign(noUser), { store, now: NOW });
  check("no user id and no matching email -> 200 ignored no_user", res.status === 200 && res.body.ignored === "no_user", JSON.stringify(res));
  check("nothing written without an identity", rows[0].current_plan === "free");
}
{
  // Email fallback: a purchase made outside the app.
  const { store, rows } = fakeStore([profileRow({ email: "Owner@Example.com" })]);
  const byEmail = body(event("subscription_created", attrs({ user_email: "owner@example.com" }), { userId: null }));
  const res = await handleLemonWebhook(Buffer.from(byEmail), sign(byEmail), { store, now: NOW });
  check("falls back to the buyer's email -> starter", res.status === 200 && rows[0].current_plan === "starter", JSON.stringify(res));
}
{
  const { store, rows } = fakeStore([profileRow({ current_plan: "pro", subscription_status: "active", ls_subscription_id: "sub_A", ls_updated_at: "2026-11-04T11:00:00Z" })]);
  const staleBody = body(event("subscription_updated", attrs({ variant_id: Number(VARIANT_PRO), status: "active", updated_at: "2026-11-04T10:00:00Z" })));
  const res = await handleLemonWebhook(Buffer.from(staleBody), sign(staleBody), { store, now: NOW });
  check("an older event for the same subscription -> 200 ignored stale", res.status === 200 && res.body.ignored === "stale", JSON.stringify(res));
  check("the stale event did not change the plan", rows[0].current_plan === "pro");
}
{
  const { store } = fakeStore([profileRow()], { failWrite: true });
  const failBody = body(event("subscription_created", attrs()));
  const res = await handleLemonWebhook(Buffer.from(failBody), sign(failBody), { store, now: NOW });
  check("a real write failure -> 500 db_error (so Lemon Squeezy retries)", res.status === 500 && res.body.error === "db_error", JSON.stringify(res));
  check("the db error text is not echoed to the caller", !JSON.stringify(res.body).includes("db down"));
}
{
  const { store } = fakeStore([]);
  const missingBody = body(event("subscription_created", attrs()));
  const res = await handleLemonWebhook(Buffer.from(missingBody), sign(missingBody), { store, now: NOW });
  check("paid but no profile row -> 200 ignored no_profile", res.status === 200 && res.body.ignored === "no_profile", JSON.stringify(res));
}
{
  const { store, calls } = fakeStore([profileRow()]);
  const paymentBody = body(event("subscription_payment_failed", attrs({ status: "past_due" })));
  const res = await handleLemonWebhook(Buffer.from(paymentBody), sign(paymentBody), { store, now: NOW });
  check("subscription_payment_* acknowledged and ignored", res.status === 200 && calls.writes === 0, JSON.stringify(res));
  const otherBody = body(event("order_created", attrs()));
  const otherRes = await handleLemonWebhook(Buffer.from(otherBody), sign(otherBody), { store, now: NOW });
  check("a non-subscription event is ignored", otherRes.status === 200 && calls.writes === 0, JSON.stringify(otherRes));
}
{
  const live = { current_plan: "pro" as const, subscription_status: "active", current_period_end: FUTURE, ls_subscription_id: "sub_A", ls_updated_at: null };
  check("a different subscription's expiry cannot wipe a live plan", isSupersededEvent(live, "sub_B", "free", NOW) === true);
  check("the same subscription's expiry is applied", isSupersededEvent(live, "sub_A", "free", NOW) === false);
  check("a newer paid subscription replaces the old one", isSupersededEvent(live, "sub_B", "starter", NOW) === false);
}

// ---------------------------------------------------------------------------
console.log("\n[10] applyLemonEvent is the same rules, called directly");
{
  const { store, rows } = fakeStore([profileRow()]);
  const res = await applyLemonEvent(store, event("subscription_created", attrs({ variant_id: Number(VARIANT_PRO) })), NOW);
  check("direct call -> pro", res.status === 200 && res.body.plan === "pro" && rows[0].current_plan === "pro", JSON.stringify(res));
}

// ---------------------------------------------------------------------------
console.log("\n[11] checkout links");
fullEnv();
const link = buildCheckoutLink("starter", { userId: U1, email: "owner@example.com" });
const parsed = link ? new URL(link) : null;
check("link keeps the configured base url", Boolean(parsed?.toString().startsWith(`${BUY_STARTER}?`)));
check("email is pre-filled", parsed?.searchParams.get("checkout[email]") === "owner@example.com");
check("user id is pre-filled (this is what the webhook reads back)", parsed?.searchParams.get("checkout[custom][user_id]") === U1);
check("a plan with no buy link yields null", buildCheckoutLink("free") === null);

// ---------------------------------------------------------------------------
console.log("\n[12] no secret ever appears in a response body");
{
  const { store } = fakeStore([profileRow()]);
  const responses = [
    await handleLemonWebhook(Buffer.from(createdBody), null, { store, now: NOW }),
    await handleLemonWebhook(Buffer.from(createdBody), "not-a-signature", { store, now: NOW }),
    await handleLemonWebhook(Buffer.from(createdBody), validSig, { store, now: NOW }),
  ];
  const dump = JSON.stringify(responses);
  check("the webhook secret is absent from every body", !dump.includes(SECRET));
  check("no signature value is echoed back", !dump.includes(validSig));
}

restoreEnv();
console.log(`\nRESULT: ${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exit(1);
