import {
  bodyTooLarge, widgetKeyFromBody, checkWidgetKeyLimits, verifyTurnstile, resetTurnstileWarning,
  normalizePhone, findDuplicate, MAX_LEAD_BODY_BYTES, WIDGET_KEY_PER_HOUR, WIDGET_KEY_PER_DAY,
  type Limiter,
} from '../api/_lib/leadGuards.ts';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${name}`); };

const KEY_A = `wk_${'a'.repeat(32)}`;
const KEY_B = `wk_${'b'.repeat(32)}`;

// A fixed-window counter like consume_rate_limit: counts per key, denies above the limit.
function counterLimiter(): Limiter & { calls: number } {
  const counts = new Map<string, number>();
  const l = {
    calls: 0,
    async allow(key: string, limit: number) {
      l.calls++;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= limit;
    },
  };
  return l;
}

console.log('[1] oversized request bodies are rejected');
check('a normal lead body is accepted', !bodyTooLarge({ name: 'Ann', roofing_need: 'leak' }));
check(`a body over ${MAX_LEAD_BODY_BYTES} bytes is rejected`, bodyTooLarge({ conversation: 'x'.repeat(MAX_LEAD_BODY_BYTES + 1) }));
check('a huge declared Content-Length is rejected even before parsing', bodyTooLarge({}, '9999999'));
check('a small declared Content-Length is accepted', !bodyTooLarge({}, '512'));
check('a garbage Content-Length header is ignored, the body is still measured', !bodyTooLarge({ a: 1 }, 'abc') && bodyTooLarge({ a: 'x'.repeat(20000) }, 'abc'));
check('multi-byte characters are counted as bytes, not characters', bodyTooLarge({ t: 'é'.repeat(9000) }));
const circular: Record<string, unknown> = {}; circular.self = circular;
check('an unserialisable body fails closed', bodyTooLarge(circular));

console.log('\n[2] widget key extraction');
check('a valid key is returned', widgetKeyFromBody({ widget_key: KEY_A }) === KEY_A);
check('surrounding spaces are trimmed', widgetKeyFromBody({ widget_key: ` ${KEY_A} ` }) === KEY_A);
check('a malformed, missing or non-object key gives null',
  widgetKeyFromBody({ widget_key: 'wk_short' }) === null && widgetKeyFromBody({}) === null && widgetKeyFromBody(null) === null && widgetKeyFromBody([KEY_A]) === null);

console.log('\n[3] per-widget-key limits (rotating IPs cannot flood one tenant)');
{
  const limiter = counterLimiter();
  let last = await checkWidgetKeyLimits(KEY_A, limiter);
  for (let i = 1; i < WIDGET_KEY_PER_HOUR; i++) last = await checkWidgetKeyLimits(KEY_A, limiter);
  check(`the first ${WIDGET_KEY_PER_HOUR} requests in an hour are allowed`, last.ok === true);
  const over = await checkWidgetKeyLimits(KEY_A, limiter);
  check('the next request is blocked with 429 widget_rate_limited', over.ok === false && over.status === 429 && over.code === 'widget_rate_limited');
  const other = await checkWidgetKeyLimits(KEY_B, limiter);
  check('a different widget key is not affected', other.ok === true);
}
{
  // hourly window resets (always allowed) but the daily cap still bites
  const counts = new Map<string, number>();
  const limiter: Limiter = { async allow(key, limit) {
    if (key.startsWith('widget-key-hour:')) return true;
    const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return n <= limit;
  } };
  let res = await checkWidgetKeyLimits(KEY_A, limiter);
  for (let i = 1; i < WIDGET_KEY_PER_DAY; i++) res = await checkWidgetKeyLimits(KEY_A, limiter);
  check(`${WIDGET_KEY_PER_DAY} requests in a day are allowed`, res.ok === true);
  const over = await checkWidgetKeyLimits(KEY_A, limiter);
  check('the daily cap then blocks with 429 widget_daily_limit', over.ok === false && over.status === 429 && over.code === 'widget_daily_limit');
}
{
  const broken: Limiter = { async allow() { throw new Error('db down'); } };
  const res = await checkWidgetKeyLimits(KEY_A, broken);
  check('if the limiter fails, the request is denied (fail closed, 503)', res.ok === false && res.status === 503);
}

console.log('\n[4] Cloudflare Turnstile');
const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
{
  resetTurnstileWarning();
  const warnings: string[] = [];
  const a = await verifyTurnstile({ secret: undefined, token: undefined, warn: (m) => warnings.push(m) });
  const b = await verifyTurnstile({ secret: '  ', token: undefined, warn: (m) => warnings.push(m) });
  check('with no secret configured the check is skipped, never a crash', a.ok === true && b.ok === true);
  check('it logs a warning (once) that the bot check is off', warnings.length === 1 && /TURNSTILE_SECRET_KEY/.test(warnings[0]));
}
{
  const f = reply({ success: true });
  const missing = await verifyTurnstile({ secret: 's3cret', token: undefined, fetchFn: f });
  const empty = await verifyTurnstile({ secret: 's3cret', token: '   ', fetchFn: f });
  const huge = await verifyTurnstile({ secret: 's3cret', token: 'x'.repeat(3000), fetchFn: f });
  check('a missing token is rejected with 400 turnstile_required', missing.ok === false && missing.status === 400 && missing.code === 'turnstile_required');
  check('an empty or oversized token is rejected', empty.ok === false && huge.ok === false);
}
{
  const bad = await verifyTurnstile({ secret: 's3cret', token: 'bad-token', fetchFn: reply({ success: false, 'error-codes': ['invalid-input-response'] }) });
  check('an invalid token is rejected with 400 turnstile_failed', bad.ok === false && bad.status === 400 && bad.code === 'turnstile_failed');
  check('the secret is never echoed back to the client', JSON.stringify(bad).indexOf('s3cret') === -1);
}
{
  let sent: { url: string; body: string } | null = null;
  const spy = (async (url: string, init: { body: URLSearchParams }) => { sent = { url, body: init.body.toString() }; return { ok: true, json: async () => ({ success: true }) } as unknown as Response; }) as unknown as typeof fetch;
  const good = await verifyTurnstile({ secret: 's3cret', token: 'good-token', remoteIp: '203.0.113.9', fetchFn: spy });
  check('a valid token is accepted', good.ok === true);
  check('it calls Cloudflare siteverify with the secret, the token and the visitor IP',
    sent !== null && (sent as { url: string }).url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    && /secret=s3cret/.test((sent as { body: string }).body) && /response=good-token/.test((sent as { body: string }).body) && /remoteip=203\.0\.113\.9/.test((sent as { body: string }).body));
}
{
  const down = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
  const r1 = await verifyTurnstile({ secret: 's3cret', token: 'tok', fetchFn: down });
  const r2 = await verifyTurnstile({ secret: 's3cret', token: 'tok', fetchFn: reply({}, false) });
  check('if Cloudflare is unreachable the request is denied (fail closed, 503)', r1.ok === false && r1.status === 503 && r2.ok === false && r2.status === 503);
  const hang = ((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
  const r3 = await verifyTurnstile({ secret: 's3cret', token: 'tok', fetchFn: hang, timeoutMs: 20 });
  check('a hanging Cloudflare request times out and is denied', r3.ok === false && r3.status === 503);
}

console.log('\n[5] duplicate submissions');
const recent = [
  { id: 'lead-1', email: 'Pat@Example.com', phone: '(214) 555-0147' },
  { id: 'lead-2', email: null, phone: '+1 817 555 0199' },
  { id: 'lead-3', email: 'other@example.com', phone: null },
];
check('phone normalisation ignores formatting and the US country code', normalizePhone('(214) 555-0147') === '2145550147' && normalizePhone('+1 214-555-0147') === '2145550147' && normalizePhone('555') === '');
check('the same email in a different case is a duplicate', findDuplicate(recent, { email: 'pat@example.com', phone: null }) === 'lead-1');
check('the same phone in a different format is a duplicate', findDuplicate(recent, { email: null, phone: '214.555.0147' }) === 'lead-1' && findDuplicate(recent, { email: null, phone: '8175550199' }) === 'lead-2');
check('a new email and phone is not a duplicate', findDuplicate(recent, { email: 'new@example.com', phone: '9725550123' }) === null);
check('missing contact details never match each other', findDuplicate(recent, { email: null, phone: null }) === null && findDuplicate(recent, { email: null, phone: '12' }) === null);

console.log(`\nLead guard checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
