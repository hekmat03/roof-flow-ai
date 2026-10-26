/**
 * Stripe webhook verifier — offline unit checks.
 * A fake secret and locally built signatures: no Stripe account, no network, no
 * real charge. Run: bun run tests/webhook.check.ts  (from the site dir)
 */
const SECRET = "whsec_offline_test_secret";
const SIG_KEY = "sk_test_offline_fake_key_000000000000";
process.env.STRIPE_SECRET_KEY = SIG_KEY;
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
const { handleWebhook, buildTestSignature, paymentsActivated } = await import("../src/lib/billing.ts");
const { supabaseEnv } = await import("../src/lib/supabase-admin.ts");

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log("  ✅", name); } else { fail++; console.log("  ❌", name, detail); }
};

const evtId = `evt_offline_${String(Date.now())}`;
const payload = JSON.stringify({
  id: evtId, object: "event", type: "invoice.paid",
  data: { object: { object: "invoice", customer: "cus_does_not_exist_offline", subscription: "sub_x" } },
});
const validSig = await buildTestSignature(payload, SECRET);

check("paymentsActivated is true when a secret key is present", paymentsActivated() === true);

const noSig = await handleWebhook(payload, null);
check("missing signature → 400", noSig.status === 400 && noSig.body.error === "missing_signature", JSON.stringify(noSig));

const badSig = await handleWebhook(payload, await buildTestSignature(payload, "whsec_wrong_secret"));
check("wrong-secret signature → 400 invalid_signature", badSig.status === 400 && badSig.body.error === "invalid_signature", JSON.stringify(badSig));

const tampered = await handleWebhook(payload.replace("invoice.paid", "invoice.payment_failed"), validSig);
check("valid signature over a TAMPERED body → 400", tampered.status === 400, JSON.stringify(tampered));

const ok = await handleWebhook(payload, validSig);
check("valid signature → 200 received", ok.status === 200 && ok.body.received === true, JSON.stringify(ok));

const again = await handleWebhook(payload, validSig);
check("same event id replayed → 200 duplicate (idempotent)", again.status === 200 && again.body.duplicate === true, JSON.stringify(again));

check("no secret in any response body", !JSON.stringify([noSig, badSig, tampered, ok, again]).includes(SIG_KEY) && !JSON.stringify([noSig, badSig, tampered, ok, again]).includes(SECRET));

// ---- cleanup: remove the idempotency row this run created ----
const { url, serviceKey } = supabaseEnv();
const del = await fetch(`${url}/rest/v1/webhook_events?stripe_event_id=eq.${evtId}`, {
  method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
check("cleanup removed the test event row", del.status === 204, String(del.status));

console.log(`RESULT: ${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exit(1);

export {};
