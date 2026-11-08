
/**
 * ratelimit.check.ts — 10 requests / minute / IP and the plan-access rules.
 * Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/ratelimit.check.ts
 */
import { enforceRateLimit, clientIp, RATE_LIMIT_PER_MINUTE, rateLimitRpcAllowed } from '../api/_lib/rateLimit.ts';
import { canAccess, requiredPlan, fallbackTab } from '../src/lib/planAccess.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };

// No SUPABASE_* env in tests -> exercises the in-memory fallback path.
const fakeReq = (ip: string) => ({ headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }) as never;
const fakeRes = () => {
  const r = { code: 0, headers: {} as Record<string, string>, body: null as unknown,
    setHeader(k: string, v: string) { r.headers[k] = v; return r; },
    status(c: number) { r.code = c; return r; },
    json(b: unknown) { r.body = b; return r; } };
  return r;
};

console.log('Rate limit');
check('limit is 10 per minute', RATE_LIMIT_PER_MINUTE === 10);
check('decodes an allowed RPC row', rateLimitRpcAllowed([{ allowed: true, remaining: 9, reset_at: 'later' }], null) === true);
check('decodes a blocked RPC row', rateLimitRpcAllowed([{ allowed: false, remaining: 0, reset_at: 'later' }], null) === false);
check('falls back on a malformed RPC result', rateLimitRpcAllowed([{ allowed: 'yes' }], null) === null);
check('falls back on an RPC error response', rateLimitRpcAllowed(null, { message: 'permission denied' }) === null);
check('reads client ip', clientIp(fakeReq('1.2.3.4')) === '1.2.3.4');
let lastAllowed = true, res = fakeRes();
for (let i = 0; i < 10; i++) { res = fakeRes(); lastAllowed = await enforceRateLimit(fakeReq('9.9.9.9'), res as never, 'test'); }
check('10th request allowed', lastAllowed === true && res.code === 0);
res = fakeRes();
const eleventh = await enforceRateLimit(fakeReq('9.9.9.9'), res as never, 'test');
check('11th request blocked with 429', eleventh === false && res.code === 429);
check('sends Retry-After', res.headers['Retry-After'] === '60');
res = fakeRes();
check('other IP unaffected', (await enforceRateLimit(fakeReq('8.8.8.8'), res as never, 'test')) === true);
res = fakeRes();
check('other route name unaffected', (await enforceRateLimit(fakeReq('9.9.9.9'), res as never, 'other')) === true);

console.log('Plan access');
check('free: chatbot yes', canAccess('free', 'agent1'));
check('free: CRM locked', !canAccess('free', 'crm'));
check('free: prompts locked', !canAccess('free', 'prompts'));
check('starter: chatbot + CRM', canAccess('starter', 'agent1') && canAccess('starter', 'crm'));
check('starter: prompts locked', !canAccess('starter', 'prompts'));
check('pro: crm + prompts', canAccess('pro', 'crm') && canAccess('pro', 'prompts'));
check('Agents 2-4 are accessible on Pro', ['agent2', 'agent3', 'agent4'].every((t) => canAccess('pro', t)));
check('Agents 2-4 remain locked on Free and Starter', ['agent2', 'agent3', 'agent4'].every((t) =>
  !canAccess('free', t) && !canAccess('starter', t)));
check('Agents 2-4 require Pro', ['agent2', 'agent3', 'agent4'].every((t) => requiredPlan(t) === 'pro'));
check('CRM needs Starter', requiredPlan('crm') === 'starter');
check('prompts need Pro', requiredPlan('prompts') === 'pro');
check('fallback tab is the chatbot', fallbackTab() === 'agent1');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
