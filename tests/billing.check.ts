/**
 * billing.check.ts — Lemon Squeezy billing: plan mapping, activation switch,
 * webhook signature, entitlement rules and the full event -> profiles flow.
 * No network, no database: Supabase is replaced by a tiny in-memory fake.
 * Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/billing.check.ts
 */
import { createHmac } from 'node:crypto';
import {
  checkoutUrlForPlan,
  paymentsActivated,
  planFromVariant,
} from '../api/_lib/plans.ts';
import { effectivePlan } from '../api/_lib/billing.ts';
import {
  applyLemonEvent,
  entitlement,
  isSupersededEvent,
  validSignature,
  type LemonEvent,
} from '../api/_lib/lemon.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };

const ENV_KEYS = [
  'LS_WEBHOOK_SECRET', 'LS_VARIANT_STARTER', 'LS_VARIANT_PRO',
  'LS_CHECKOUT_URL_STARTER', 'LS_CHECKOUT_URL_PRO',
];
const clearEnv = () => { for (const k of ENV_KEYS) delete process.env[k]; };
const fullEnv = () => {
  process.env.LS_WEBHOOK_SECRET = 'whsec_test';
  process.env.LS_VARIANT_STARTER = '1001';
  process.env.LS_VARIANT_PRO = '2002';
  process.env.LS_CHECKOUT_URL_STARTER = 'https://shop.lemonsqueezy.com/checkout/buy/starter';
  process.env.LS_CHECKOUT_URL_PRO = 'https://shop.lemonsqueezy.com/checkout/buy/pro';
};

// ---------------------------------------------------------------------------
// In-memory stand-in for the Supabase client (only what lemon.ts touches).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
function fakeAdmin(rows: Row[], opts: { failUpdate?: boolean } = {}) {
  const from = (table: string) => {
    if (table !== 'profiles') throw new Error(`unexpected table ${table}`);
    return {
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => ({ data: rows.find((r) => r[col] === val) ?? null, error: null }),
        }),
      }),
      update: (patch: Row) => ({
        eq: (col: string, val: unknown) => ({
          select: async (_cols: string) => {
            if (opts.failUpdate) return { data: null, error: { message: 'boom' } };
            const hit = rows.filter((r) => r[col] === val);
            hit.forEach((r) => Object.assign(r, patch));
            return { data: hit.map((r) => ({ user_id: r.user_id })), error: null };
          },
        }),
      }),
    };
  };
  return { from } as never;
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-11-04T12:00:00Z');
const FUTURE = '2026-12-04T12:00:00Z';
const PAST = '2026-10-01T12:00:00Z';

const evt = (
  name: string,
  attrs: Record<string, unknown>,
  o: { subId?: string; userId?: string | null } = {},
): LemonEvent => ({
  meta: { event_name: name, custom_data: o.userId === null ? {} : { user_id: o.userId ?? U1 } },
  data: { id: o.subId ?? 'sub_A', attributes: attrs },
});

const base = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  variant_id: 1001,
  customer_id: 77,
  user_email: 'Owner@Example.com',
  renews_at: FUTURE,
  ends_at: null,
  cancelled: false,
  urls: { customer_portal: 'https://portal.example/abc' },
  updated_at: '2026-11-04T11:00:00Z',
  ...over,
});

const profile = (over: Row = {}): Row => ({
  user_id: U1, email: 'owner@example.com', current_plan: 'free', subscription_status: 'none',
  ls_subscription_id: null, ls_updated_at: null, current_period_end: null, ...over,
});

// ---------------------------------------------------------------------------
console.log('\n[1] plans: activation switch + variant mapping');
clearEnv();
check('payments OFF with no env', paymentsActivated() === false);
process.env.LS_WEBHOOK_SECRET = 'x';
process.env.LS_CHECKOUT_URL_STARTER = 'https://a.example/s';
process.env.LS_CHECKOUT_URL_PRO = 'https://a.example/p';
check('payments OFF without variant ids (paid users could never be upgraded)', paymentsActivated() === false);
fullEnv();
check('payments ON with secret + variants + both buy links', paymentsActivated() === true);
delete process.env.LS_VARIANT_PRO;
check('payments OFF when one variant id is missing', paymentsActivated() === false);
fullEnv();
delete process.env.LS_WEBHOOK_SECRET;
check('payments OFF without webhook secret', paymentsActivated() === false);
fullEnv();
process.env.LS_CHECKOUT_URL_PRO = 'http://insecure.example/p';
check('non-https buy link is rejected', checkoutUrlForPlan('pro') === null && paymentsActivated() === false);
fullEnv();
check('free plan has no checkout link', checkoutUrlForPlan('free') === null);
check('variant 1001 -> starter (number or string)', planFromVariant(1001) === 'starter' && planFromVariant('1001') === 'starter');
check('variant 2002 -> pro', planFromVariant(2002) === 'pro');
check('unknown / empty variant -> null', planFromVariant(9999) === null && planFromVariant('') === null && planFromVariant(undefined) === null);

// ---------------------------------------------------------------------------
console.log('\n[2] webhook signature');
const body = Buffer.from(JSON.stringify({ hello: 'world' }));
const good = createHmac('sha256', 'whsec_test').update(body).digest('hex');
check('valid signature accepted', validSignature(body, good, 'whsec_test'));
check('wrong secret rejected', !validSignature(body, good, 'other'));
check('tampered body rejected', !validSignature(Buffer.from('{"hello":"w0rld"}'), good, 'whsec_test'));
check('missing header rejected', !validSignature(body, undefined, 'whsec_test'));
check('empty secret rejected', !validSignature(body, good, ''));
check('non-hex header rejected', !validSignature(body, 'zzzz-not-hex', 'whsec_test'));
check('short header rejected', !validSignature(body, good.slice(0, 10), 'whsec_test'));
check('uppercase hex still verifies', validSignature(body, good.toUpperCase(), 'whsec_test'));

// ---------------------------------------------------------------------------
console.log('\n[3] entitlement (what a Lemon Squeezy status is worth)');
check('active starter -> starter', entitlement(base(), NOW) === 'starter');
check('active pro -> pro', entitlement(base({ variant_id: 2002 }), NOW) === 'pro');
check('on_trial keeps plan', entitlement(base({ status: 'on_trial' }), NOW) === 'starter');
check('past_due keeps access during retries', entitlement(base({ status: 'past_due' }), NOW) === 'starter');
check('cancelled, period not over -> still paid plan', entitlement(base({ status: 'cancelled', ends_at: FUTURE }), NOW) === 'starter');
check('cancelled, period over -> free', entitlement(base({ status: 'cancelled', ends_at: PAST }), NOW) === 'free');
check('cancelled with no end date -> free', entitlement(base({ status: 'cancelled', ends_at: null }), NOW) === 'free');
check('expired -> free', entitlement(base({ status: 'expired' }), NOW) === 'free');
check('unpaid -> free', entitlement(base({ status: 'unpaid' }), NOW) === 'free');
check('paused -> free', entitlement(base({ status: 'paused' }), NOW) === 'free');
check('unknown status -> free (fail closed)', entitlement(base({ status: 'weird' }), NOW) === 'free');
check('active but unmapped variant -> unmapped', entitlement(base({ variant_id: 5 }), NOW) === 'unmapped');

// ---------------------------------------------------------------------------
console.log('\n[4] effectivePlan (what the API enforces)');
const p = (current_plan: string, subscription_status: string, current_period_end: string | null = null) =>
  ({ current_plan, subscription_status, current_period_end });
check('no profile -> free', effectivePlan(null, NOW) === 'free');
check('pro + active -> pro', effectivePlan(p('pro', 'active'), NOW) === 'pro');
check('pro + past_due -> pro', effectivePlan(p('pro', 'past_due'), NOW) === 'pro');
check('pro + on_trial -> pro', effectivePlan(p('pro', 'on_trial'), NOW) === 'pro');
check('pro + expired -> free', effectivePlan(p('pro', 'expired'), NOW) === 'free');
check('pro + paused -> free', effectivePlan(p('pro', 'paused'), NOW) === 'free');
check('pro + unpaid -> free', effectivePlan(p('pro', 'unpaid'), NOW) === 'free');
check('pro + none -> free', effectivePlan(p('pro', 'none'), NOW) === 'free');
check('pro + empty status -> free', effectivePlan(p('pro', ''), NOW) === 'free');
check('pro + unknown status -> free (fail closed, not the paid plan)', effectivePlan(p('pro', 'weird'), NOW) === 'free');
check('starter + unknown status -> free (fail closed)', effectivePlan(p('starter', 'status_from_the_future'), NOW) === 'free');
check('cancelled with unparseable period end -> free', effectivePlan(p('pro', 'cancelled', 'not-a-date'), NOW) === 'free');
check('starter + cancelled, period left -> starter', effectivePlan(p('starter', 'cancelled', FUTURE), NOW) === 'starter');
check('starter + cancelled, period over -> free', effectivePlan(p('starter', 'cancelled', PAST), NOW) === 'free');
check('garbage plan value -> free', effectivePlan(p('enterprise', 'active'), NOW) === 'free');

// ---------------------------------------------------------------------------
console.log('\n[5] webhook -> profiles');
fullEnv();
{
  const rows = [profile()];
  const r = await applyLemonEvent(fakeAdmin(rows), evt('subscription_created', base()), NOW);
  check('subscription_created upgrades to starter', r.status === 200 && r.body.plan === 'starter' && rows[0].current_plan === 'starter');
  check('stores subscription + customer + portal + period end',
    rows[0].ls_subscription_id === 'sub_A' && rows[0].ls_customer_id === '77' &&
    rows[0].ls_portal_url === 'https://portal.example/abc' && rows[0].current_period_end === FUTURE);
  check('status recorded', rows[0].subscription_status === 'active' && rows[0].cancel_at_period_end === false);

  const up = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_updated', base({ variant_id: 2002, updated_at: '2026-11-04T11:30:00Z' })), NOW);
  check('plan change via portal (variant swap) -> pro', up.body.plan === 'pro' && rows[0].current_plan === 'pro');

  const old = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_updated', base({ variant_id: 1001, updated_at: '2026-11-04T10:00:00Z' })), NOW);
  check('older event for same subscription is ignored (stale)', old.body.ignored === 'stale' && rows[0].current_plan === 'pro');

  const cancel = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_cancelled', base({ variant_id: 2002, status: 'cancelled', cancelled: true, ends_at: FUTURE, updated_at: '2026-11-04T11:45:00Z' })), NOW);
  check('cancel keeps Pro until period end', rows[0].current_plan === 'pro' && rows[0].subscription_status === 'cancelled' && cancel.status === 200);
  check('cancel flags cancel_at_period_end', rows[0].cancel_at_period_end === true);

  const resumed = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_resumed', base({ variant_id: 2002, status: 'active', cancelled: false, updated_at: '2026-11-04T11:50:00Z' })), NOW);
  check('resume clears cancel flag', resumed.status === 200 && rows[0].cancel_at_period_end === false && rows[0].subscription_status === 'active');

  const exp = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_expired', base({ variant_id: 2002, status: 'expired', ends_at: PAST, updated_at: '2026-11-04T11:55:00Z' })), NOW);
  check('expired drops to free', exp.body.plan === 'free' && rows[0].current_plan === 'free');
}
{
  const rows = [profile({ current_plan: 'starter', subscription_status: 'active', ls_subscription_id: 'sub_A' })];
  const pay = await applyLemonEvent(fakeAdmin(rows), evt('subscription_payment_failed', base({ status: 'past_due' })), NOW);
  check('subscription_payment_* acknowledged, no write', pay.status === 200 && pay.body.ignored === 'subscription_payment_failed' && rows[0].subscription_status === 'active');
  const other = await applyLemonEvent(fakeAdmin(rows), evt('order_created', base()), NOW);
  check('unrelated events acknowledged, no write', other.status === 200 && rows[0].current_plan === 'starter');
  const pd = await applyLemonEvent(fakeAdmin(rows), evt('subscription_updated', base({ status: 'past_due' })), NOW);
  check('past_due keeps plan and records status', rows[0].current_plan === 'starter' && rows[0].subscription_status === 'past_due' && pd.status === 200);
}
{
  // The previous subscription's expiry must not wipe a newer live one.
  const rows = [profile({
    current_plan: 'pro', subscription_status: 'active', ls_subscription_id: 'sub_B',
    ls_updated_at: '2026-11-04T09:00:00Z', current_period_end: FUTURE,
  })];
  const r = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_expired', base({ status: 'expired', ends_at: PAST, updated_at: '2026-11-04T11:00:00Z' }), { subId: 'sub_A' }), NOW);
  check('old subscription expiring does not wipe the new Pro plan', r.body.ignored === 'superseded' && rows[0].current_plan === 'pro' && rows[0].ls_subscription_id === 'sub_B');
}
{
  // ...but a genuinely new paid subscription replaces the old one.
  const rows = [profile({
    current_plan: 'starter', subscription_status: 'cancelled', ls_subscription_id: 'sub_A',
    ls_updated_at: '2026-11-01T09:00:00Z', current_period_end: FUTURE,
  })];
  const r = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_created', base({ variant_id: 2002 }), { subId: 'sub_B' }), NOW);
  check('new paid subscription replaces a cancelled-but-running one', r.body.plan === 'pro' && rows[0].ls_subscription_id === 'sub_B');
}
{
  // A DIFFERENT dead subscription may still correctly downgrade a user who has nothing live.
  const rows = [profile({
    current_plan: 'starter', subscription_status: 'cancelled', ls_subscription_id: 'sub_A',
    ls_updated_at: '2026-09-01T09:00:00Z', current_period_end: PAST,
  })];
  const r = await applyLemonEvent(fakeAdmin(rows),
    evt('subscription_expired', base({ status: 'expired', ends_at: PAST }), { subId: 'sub_A' }), NOW);
  check('expiry of the tracked subscription downgrades', r.body.plan === 'free' && rows[0].current_plan === 'free');
}
{
  const rows = [profile()];
  const r = await applyLemonEvent(fakeAdmin(rows), evt('subscription_created', base({ variant_id: 31337 })), NOW);
  check('unmapped variant: nothing written (and logged)', r.status === 200 && r.body.ignored === 'unmapped_variant' && rows[0].current_plan === 'free');
}
{
  const rows = [profile()];
  const r = await applyLemonEvent(fakeAdmin(rows), evt('subscription_created', base(), { userId: null }), NOW);
  check('no custom user_id -> falls back to buyer email (case-insensitive)', r.body.plan === 'starter' && rows[0].current_plan === 'starter');
  const none = await applyLemonEvent(fakeAdmin([profile()]), evt('subscription_created', base({ user_email: 'stranger@x.com' }), { userId: null }), NOW);
  check('unknown buyer -> ignored, no write', none.status === 200 && none.body.ignored === 'no_user');
  const bad = await applyLemonEvent(fakeAdmin([profile()]), evt('subscription_created', base({ user_email: '' }), { userId: 'not-a-uuid' }), NOW);
  check('malformed user_id and no email -> ignored', bad.body.ignored === 'no_user');
}
{
  const r = await applyLemonEvent(fakeAdmin([]), evt('subscription_created', base()), NOW);
  check('paid but no profile row: not reported as success', r.status === 200 && r.body.ignored === 'no_profile' && r.body.plan === undefined);
  const e = await applyLemonEvent(fakeAdmin([profile()], { failUpdate: true }), evt('subscription_created', base()), NOW);
  check('database failure -> 500 so Lemon Squeezy retries', e.status === 500);
}
{
  const rows = [profile(), profile({ user_id: U2, email: 'other@example.com' })];
  await applyLemonEvent(fakeAdmin(rows), evt('subscription_created', base()), NOW);
  check('only the targeted user is changed', rows[0].current_plan === 'starter' && rows[1].current_plan === 'free');
}

// ---------------------------------------------------------------------------
console.log('\n[6] superseded guard (unit)');
const live = { ls_subscription_id: 'B', current_plan: 'pro', subscription_status: 'active', current_period_end: FUTURE, ls_updated_at: null };
check('different sub + free + live entitlement -> superseded', isSupersededEvent(live, 'A', 'free', NOW));
check('same sub never superseded', !isSupersededEvent(live, 'B', 'free', NOW));
check('different sub + paid plan -> not superseded', !isSupersededEvent(live, 'A', 'starter', NOW));
check('nothing tracked yet -> not superseded', !isSupersededEvent(null, 'A', 'free', NOW));

clearEnv();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
