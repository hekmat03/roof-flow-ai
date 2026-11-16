/**
 * integrations.check.ts — unit-ish verification for the real-integrations
 * tier: aiService graceful degradation, webhook no-op/tolerance, and Web
 * Speech feature detection (bare mocks).
 *
 * Run: node --experimental-strip-types tests/integrations.check.ts
 */

import { callAgentApi, fetchAiStatus } from '../src/utils/aiService.ts';
import { demoFallbackReply, GENERIC_DEMO_REPLY } from '../src/lib/demoFallback.ts';
import { ENV_CATALOG, evaluateEnv } from '../api/_lib/envCheck.ts';
import {
  AI_NOTICES,
  DB_NOTICES,
  classifyAiFailure,
  classifyDbError,
  getServiceStatus,
  reportAiOk,
  reportDbFailure,
  reportDbOk,
} from '../src/lib/serviceStatus.ts';
import { postLeadToWebhook, setWebhookUrl, getWebhookUrl } from '../src/utils/webhook.ts';
import {
  isSpeechSynthesisSupported,
  isSpeechRecognitionSupported,
  speakText,
  startListening,
} from '../src/utils/speech.ts';
import {
  extractEmail,
  extractPhone,
  extractName,
  extractZip,
  deriveRoofIssue,
} from '../src/utils/leadExtract.ts';

// The widget's server logic (validation, scoring, rate limiting) is the single
// source of truth inside the team's site app, which is where the public
// /api/leads route runs. We import it directly rather than duplicating the
// rules here, so these checks always exercise the code that actually serves
// visitors. If the site directory is absent, the checks FAIL loudly instead of
// skipping — an unrun test must never look like a passing one.
import {
  validateLead,
  scoreLead,
  rateLimit,
  recordSuccess,
  _resetRateLimit,
  isValidPhone,
  isValidEmail,
  isValidZip,
  cleanConversation,
  RATE_LIMIT_MAX,
} from '../site-server/src/lib/leads-core.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`);
  }
}

// ------------------------------------------------------------------
// 1. aiService — graceful degradation when the server API is unreachable
//    (in Node there is no origin, so the relative fetch always fails)
// ------------------------------------------------------------------
console.log('\n[1] aiService: server API unreachable');
let r1: string | null = 'sentinel';
try {
  r1 = await callAgentApi({ agentType: 'chatbot', messages: [{ role: 'user', content: 'hello' }] });
} catch (e) {
  r1 = 'THREW: ' + String(e);
}
check('callAgentApi returns null (never throws) when API unreachable', r1 === null);
check('an unreachable AI is recorded as a connection problem', getServiceStatus().ai === 'network');
check('every AI reason has a plain-language title and detail', Object.values(AI_NOTICES).every((n) => n.title.length > 3 && n.detail.length > 10));
check('every database reason has a plain-language title and detail', Object.values(DB_NOTICES).every((n) => n.title.length > 3 && n.detail.length > 10));
check('AI 503 "not configured" is explained as not set up', classifyAiFailure({ status: 503, message: 'AI is not configured on the server' }) === 'not_configured');
check('AI 502 is explained as unavailable', classifyAiFailure({ status: 502 }) === 'unavailable');
check('AI 429 is explained as too many messages', classifyAiFailure({ status: 429 }) === 'rate_limited');
check('AI 401 is explained as an expired session', classifyAiFailure({ status: 401 }) === 'session');
check('AI timeout is explained as a timeout', classifyAiFailure({ aborted: true }) === 'timeout');
check('database "Failed to fetch" is a connection problem', classifyDbError(new Error('TypeError: Failed to fetch')) === 'network');
check('database JWT expiry is a session problem', classifyDbError({ message: 'JWT expired', status: 401 }) === 'session');
check('any other database error is "not responding"', classifyDbError(new Error('boom')) === 'unavailable');
reportDbFailure('unavailable');
check('database failure is recorded', getServiceStatus().db === 'unavailable');
reportDbOk(); reportAiOk();
check('success clears both warnings', getServiceStatus().db === null && getServiceStatus().ai === null);

// ------------------------------------------------------------------
// 2. aiService — status probe + no browser-held keys
// ------------------------------------------------------------------
console.log('\n[2] aiService: status probe');
const status = await fetchAiStatus();
check('fetchAiStatus returns null (never throws) when API unreachable', status === null);
// Minimal localStorage stub (webhook helpers only need getItem/setItem/removeItem).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

// ------------------------------------------------------------------
// 3. webhook — no-op on empty URL, tolerance of failed fetch
// ------------------------------------------------------------------
console.log('\n[3] webhook: no-op + failure tolerance');
check('getWebhookUrl empty by default', getWebhookUrl() === '');
let r3: boolean | string = 'sentinel';
try {
  r3 = await postLeadToWebhook({
    name: 'T', phone: 'x', email: 'x', zip: 'x', roofIssue: 'x',
    status: 'New Lead', source: 'test', timestamp: new Date().toISOString(),
  });
} catch (e) {
  r3 = 'THREW: ' + String(e);
}
check('postLeadToWebhook no-ops (false, never throws) with no URL', r3 === false);

setWebhookUrl('http://127.0.0.1:9/unreachable'); // closed port → fast refusal
let r4: boolean | string = 'sentinel';
try {
  r4 = await postLeadToWebhook({
    name: 'T', phone: 'x', email: 'x', zip: 'x', roofIssue: 'x',
    status: 'New Lead', source: 'test', timestamp: new Date().toISOString(),
  });
} catch (e) {
  r4 = 'THREW: ' + String(e);
}
check('postLeadToWebhook swallows failed fetch (false, never throws)', r4 === false);
setWebhookUrl(''); // cleanup

// ------------------------------------------------------------------
// 4. speech — feature detection (unsupported + bare mocks)
// ------------------------------------------------------------------
console.log('\n[4] speech: feature detection + bare mocks');
// Node has no window at all → unsupported.
check('isSpeechSynthesisSupported false without window', isSpeechSynthesisSupported() === false);
check('isSpeechRecognitionSupported false without window', isSpeechRecognitionSupported() === false);
let spoke: string | null = null;
await speakText('test', { onEnd: () => { spoke = 'ended'; } });
check('speakText resolves gracefully (onEnd fired) when unsupported', spoke === 'ended');
check('startListening returns null when unsupported', startListening({ onFinal: () => {} }) === null);

// Bare mocks: minimal window.speechSynthesis + fake SpeechRecognition.
const listeners: Record<string, Function> = {};
class FakeRecognition {
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
  onresult: Function | null = null; onerror: Function | null = null; onend: Function | null = null;
  start() { /* no-op */ }
  stop() { this.onend?.(); }
  abort() {}
}
(globalThis as any).window = {
  speechSynthesis: { cancel: () => {}, speak: () => {}, getVoices: () => [] },
  SpeechRecognition: FakeRecognition,
};
check('isSpeechSynthesisSupported true with mock', isSpeechSynthesisSupported());
check('isSpeechRecognitionSupported true with mock', isSpeechRecognitionSupported());
const handle = startListening({
  onFinal: t => { listeners.final = t; },
});
check('startListening returns handle with mock', handle !== null && typeof handle.stop === 'function');
handle?.stop();

// ------------------------------------------------------------------
// 5. leadExtract — free-form contact extraction (Agent 1/3/4 capture)
// ------------------------------------------------------------------
console.log('\n[5] leadExtract: free-form contact extraction');
const sample = 'Hi, I am Dana Whitfield, my email is dana.w@example.com, call me at (214) 555-0177, zip 75201';
check('email extracted', extractEmail(sample) === 'dana.w@example.com');
check('phone extracted', (extractPhone(sample) || '').replace(/\D/g, '') === '2145550177');
check('name extracted (I am …)', extractName(sample) === 'Dana Whitfield');
check('zip extracted (not phone digits)', extractZip(sample) === '75201');
check('roof issue: hail', deriveRoofIssue('we have hail damage and leaks') === 'Hail / storm damage');
check('roof issue: leak', deriveRoofIssue('water dripping from the ceiling') === 'Active roof leak');
check('no name from generic text', extractName('Yes I am free tomorrow afternoon') === undefined);
check('rejects repeating-digit phone', extractPhone('call 000-000-0000') === undefined);
check('name via "X here"', extractName('John Miller here — lorem ipsum') === 'John Miller');

// ------------------------------------------------------------------
// 6. widget API: lead validation accept/reject matrix
// ------------------------------------------------------------------
console.log('\n[6] widget API: lead validation');
const GOOD = {
  name: 'Dana Whitfield',
  phone: '(214) 555-0147',
  email: 'dana.w@example.com',
  zip_code: '75024',
  roofing_need: 'Hail damage and a leak in the ceiling',
  consent: true,
  consent_text: 'I agree to be contacted.',
  conversation: [{ sender: 'visitor', text: 'hail damage', timestamp: 't' }],
};
const bad = (over: Record<string, unknown>) => validateLead({ ...GOOD, ...over });

check('accepts a complete lead', validateLead(GOOD).ok === true);
check('accepts phone-only (email omitted)', validateLead({ ...GOOD, email: '' }).ok === true);
check('accepts email-only (phone omitted)', validateLead({ ...GOOD, phone: '' }).ok === true);
check("accepts ZIP as 'N/A' when refused", validateLead({ ...GOOD, zip_code: 'N/A' }).ok === true);
check('REJECTS honeypot filled', bad({ company_website: 'http://spam.example' }).ok === false);
check('REJECTS missing consent', bad({ consent: false }).ok === false);
check('REJECTS consent given as string "true"', bad({ consent: 'true' }).ok === false);
check('REJECTS no phone AND no email', bad({ phone: '', email: '' }).ok === false);
check('REJECTS bad phone', bad({ phone: '12' }).ok === false);
check('REJECTS bad email', bad({ email: 'not-an-email' }).ok === false);
check('REJECTS bad phone + bad email together', bad({ phone: '555', email: 'nope@' }).ok === false);
check('REJECTS bad ZIP', bad({ zip_code: '12' }).ok === false);
check('REJECTS 1-char name', bad({ name: 'A' }).ok === false);
check('REJECTS 2-char roofing_need', bad({ roofing_need: 'ok' }).ok === false);
check('rejects and names the failing field (consent)', (() => {
  const r = bad({ consent: false });
  return r.ok === false && r.failure.field === 'consent';
})());
// Oversize: everything is LENGTH-CAPPED rather than rejected (documented
// behaviour — a long, chatty visitor is still a real lead).
const over = validateLead({ ...GOOD, name: 'N'.repeat(200), roofing_need: 'x'.repeat(2000) });
check('caps oversize name at 80 (accepted, not rejected)', over.ok === true && over.lead.name.length === 80);
check('caps oversize roofing_need at 500', over.ok === true && over.lead.roofing_need.length === 500);
const ctrl = validateLead({ ...GOOD, name: 'Dana\u0000\u0007 Whit\u001f field' });
check('strips control characters', ctrl.ok === true && ctrl.lead.name === 'Dana Whit field');
check('caps conversation turns at 40', cleanConversation(Array.from({ length: 60 }, () => ({ sender: 'visitor', text: 'hi', timestamp: 't' }))).length === 40);
check('drops empty conversation turns', cleanConversation([{ sender: 'visitor', text: '   ', timestamp: 't' }]).length === 0);
check('non-array conversation becomes []', cleanConversation('nonsense').length === 0);

// format helpers directly
check('isValidPhone: 10 digits ok', isValidPhone('2145550147') === true);
check('isValidPhone: 11 digits with leading 1 ok', isValidPhone('1-214-555-0147') === true);
check('isValidPhone: 9 digits bad', isValidPhone('214555014') === false);
check('isValidPhone: letters+digits bad', isValidPhone('aaaaaaaaaa1') === false);
check('isValidEmail: ok', isValidEmail('a@b.co') === true);
check('isValidEmail: no TLD bad', isValidEmail('a@b') === false);
check('isValidZip: 5 digits ok', isValidZip('75024') === true);
check('isValidZip: 4 digits bad', isValidZip('7502') === false);
check("isValidZip: 'N/A' ok", isValidZip('N/A') === true);

// ------------------------------------------------------------------
// 7. widget API: lead scoring (deterministic 0–100)
// ------------------------------------------------------------------
console.log('\n[7] widget API: lead scoring');
const score = (over: Record<string, unknown>) =>
  scoreLead({ phone: null, email: null, zip_code: 'N/A', roofing_need: 'roof', conversation: [], consent: true, ...over });

check('bare minimum (consent only) scores 10', score({}).score === 10);
check('phone only adds 25 (35 total)', score({ phone: '2145550147' }).score === 35);
check('email only adds 20 (30 total)', score({ email: 'a@b.co' }).score === 30);
check('phone + email adds 35 (45 total)', score({ phone: '2145550147', email: 'a@b.co' }).score === 45);
check('valid ZIP adds 15 (25 total)', score({ zip_code: '75024' }).score === 25);
check('urgency keyword adds 5', score({ roofing_need: 'there is a leak' }).score === 15);
check('urgency caps at 25', score({ roofing_need: 'leak water storm hail emergency tarp sagging mold missing shingles' }).score === 35);
check('engagement: 3 turns add 9', score({ conversation: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }).score === 19);
check('engagement caps at 15', score({ conversation: Array.from({ length: 9 }, () => ({ text: 'x' })) }).score === 25);
const best = score({
  phone: '2145550147',
  email: 'a@b.co',
  zip_code: '75024',
  roofing_need: 'emergency leak, hail, storm, missing shingles, mold, tarp, water, sagging',
  conversation: Array.from({ length: 9 }, () => ({ text: 'storm' })),
});
check('ideal lead scores exactly 100', best.score === 100);
check('score never exceeds 100', best.score <= 100);
check('scoring is deterministic', score({ phone: '2145550147' }).score === score({ phone: '2145550147' }).score);
check('score explains itself (reasons)', score({ phone: '2145550147', zip_code: '75024' }).reasons.length >= 2);

// ------------------------------------------------------------------
// 8. widget API: per-IP rate limiter (in-memory; resets on restart)
// ------------------------------------------------------------------
console.log('\n[8] widget API: rate limiter');
_resetRateLimit();
const ipA = '203.0.113.7';
const now = 1_000_000_000_000;
let allowedCount = 0;
for (let i = 0; i < RATE_LIMIT_MAX; i++) {
  if (rateLimit(ipA, now).allowed) {
    allowedCount++;
    recordSuccess(ipA, now);
  }
}
check(`allows exactly ${String(RATE_LIMIT_MAX)} successes in the window`, allowedCount === RATE_LIMIT_MAX);
const blocked = rateLimit(ipA, now);
check('blocks the next submission', blocked.allowed === false);
check('reports a Retry-After of at most 10 minutes', blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 600);
check('another IP is unaffected', rateLimit('198.51.100.9', now).allowed === true);
check('quota frees up after the 10-minute window', rateLimit(ipA, now + 10 * 60 * 1000 + 1).allowed === true);
_resetRateLimit();
check('reset clears all buckets (test seam)', rateLimit(ipA, now).allowed === true);
// A visitor who is still typing must not be punished: only successes consume quota.
_resetRateLimit();
for (let i = 0; i < 20; i++) rateLimit('198.51.100.44', now); // no recordSuccess
check('failed/no-op submissions do not consume quota', rateLimit('198.51.100.44', now).allowed === true);
_resetRateLimit();


// ------------------------------------------------------------------
// N. Chatbots keep answering when the AI key is missing
// ------------------------------------------------------------------
console.log('\n[N] no AI key: every chatbot still answers');
{
  const savedEnv = { x: process.env.XAI_API_KEY, g: process.env.GROQ_API_KEY, p: process.env.AI_PROVIDER };
  const savedFetch = globalThis.fetch;
  const hadWindow = 'window' in globalThis;
  const savedWindow = (globalThis as any).window;
  delete process.env.XAI_API_KEY; delete process.env.GROQ_API_KEY; delete process.env.AI_PROVIDER;

  const mk = (method: string, body: unknown = {}) => {
    const out: { status: number; json: any } = { status: 200, json: null };
    const res: any = { setHeader() {}, status(c: number) { out.status = c; return res; }, json(o: unknown) { out.json = o; return res; }, end() { return res; } };
    return { req: { method, body, headers: { 'x-forwarded-for': '203.0.113.9' }, query: {} } as any, res, out };
  };
  const msgs = [{ role: 'user', content: 'I have a leak' }];
  const handlers: Array<[string, string, unknown]> = [
    ['agent-response', '../api/agent-response.ts', { agentType: 'chatbot', messages: msgs }],
    ['agent-run', '../api/agent-run.ts', { agentType: 'chatbot', messages: msgs }],
    ['demo-chat', '../api/demo-chat.ts', { messages: msgs }],
  ];
  for (const [name, path, body] of handlers) {
    const mod = await import(path);
    const c = mk('POST', body);
    await mod.default(c.req, c.res);
    check(`${name}: a missing key is a clean 503 with a message (no crash)`, c.out.status === 503 && typeof c.out.json?.error === 'string');
  }
  {
    const mod = await import('../api/widget-reply.ts');
    const c = mk('POST', { messages: msgs });
    await mod.default(c.req, c.res);
    check('widget-reply: a missing key tells the widget to use its guided script', c.out.status === 200 && c.out.json?.fallback === true);
  }

  // What the dashboard does when the server answers 503.
  (globalThis as any).window = { dispatchEvent() {}, localStorage: { getItem: () => null, setItem() {} } };
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ error: 'AI is not configured on the server' }), { status: 503, headers: { 'content-type': 'application/json' } });
  const { runAgentWithTools } = await import('../src/lib/agentRunner.ts');
  const { getAgentResponse } = await import('../src/lib/agentService.ts');
  for (const q of ['My roof is leaking after the storm', 'How much does a roof replacement cost?', 'Can you book an inspection for Friday?', 'hello']) {
    const r = await runAgentWithTools('chatbot', [{ role: 'user', content: q }], { companyName: 'ABC Roofing' });
    check(`dashboard chatbot still answers "${q}"`, r.live === false && r.reply.trim().length > 20);
  }
  check('the banner says the AI is not set up', getServiceStatus().ai === 'not_configured');
  for (const a of ['phone', 'nurturer', 'closer'] as const) {
    const r = await getAgentResponse(a, [{ role: 'user', content: 'tell me more' }], { companyName: 'ABC Roofing' });
    check(`${a} agent still answers`, r.trim().length > 20);
  }

  // Landing-page demo: a built-in FAQ answers by topic instead of one canned line.
  check('demo FAQ answers pricing with the real prices', /\$19/.test(demoFallbackReply('how much does it cost?')) && /\$39/.test(demoFallbackReply('what are your plans')));
  check('demo FAQ is honest that SMS is not offered', /does not send text/i.test(demoFallbackReply('Can it text my customers?')));
  check('demo FAQ is honest that live calls are not offered', /does not make or answer live phone calls/i.test(demoFallbackReply('does it answer phone calls?')));
  check('demo FAQ explains the CRM', /CRM board/.test(demoFallbackReply('what happens to my CRM?')));
  check('demo FAQ explains how it works', /one script tag|chat to your roofing website/i.test(demoFallbackReply('How does lead response work?')));
  check('demo FAQ never returns an empty reply', demoFallbackReply('').length > 20 && demoFallbackReply('qwerty zzz').length > 20);
  check('demo FAQ falls back to the general summary for unknown topics', demoFallbackReply('qwerty zzz') === GENERIC_DEMO_REPLY);

  reportAiOk();
  globalThis.fetch = savedFetch;
  if (hadWindow) (globalThis as any).window = savedWindow; else delete (globalThis as any).window;
  for (const [k, v] of [['XAI_API_KEY', savedEnv.x], ['GROQ_API_KEY', savedEnv.g], ['AI_PROVIDER', savedEnv.p]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}


// ------------------------------------------------------------------
// O. Environment checker: catches wrong URLs, swapped keys and half-set-up features
// ------------------------------------------------------------------
console.log('\n[O] environment variable checker');
{
  const jwt = (claims: Record<string, unknown>) =>
    `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const good: Record<string, string> = {
    SUPABASE_URL: 'https://abcdwxyz.supabase.co',
    VITE_SUPABASE_URL: 'https://abcdwxyz.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: 'abcdwxyz', exp }),
    VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'abcdwxyz', exp }),
    SESSION_SECRET: 'a'.repeat(40),
    APP_BASE_URL: 'https://my-roofing-app.vercel.app',
    XAI_API_KEY: 'xai-abc123',
    CRON_SECRET: 'c'.repeat(24),
  };
  const run = (over: Record<string, string | undefined> = {}) => evaluateEnv({ ...good, ...over });
  const status = (r: ReturnType<typeof evaluateEnv>, name: string) => r.results.find((x) => x.name === name)!.status;

  check('a correct setup has no problems', run().requiredOk === true && run().problems.length === 0);
  check('an empty environment fails every required variable', evaluateEnv({}).requiredOk === false && evaluateEnv({}).problems.length >= 6);
  check('the anon key pasted into the service role slot is caught', status(run({ SUPABASE_SERVICE_ROLE_KEY: good.VITE_SUPABASE_ANON_KEY }), 'SUPABASE_SERVICE_ROLE_KEY') === 'invalid');
  check('the SERVICE key in the public VITE_ slot is caught', status(run({ VITE_SUPABASE_ANON_KEY: good.SUPABASE_SERVICE_ROLE_KEY }), 'VITE_SUPABASE_ANON_KEY') === 'invalid');
  check('a different project in the browser URL is caught', status(run({ VITE_SUPABASE_URL: 'https://other.supabase.co' }), 'VITE_SUPABASE_URL') === 'invalid');
  check('a key from another Supabase project is caught', status(run({ SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: 'zzzz', exp }) }), 'SUPABASE_SERVICE_ROLE_KEY') === 'invalid');
  check('an expired key is caught', status(run({ SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: 'abcdwxyz', exp: 1000 }) }), 'SUPABASE_SERVICE_ROLE_KEY') === 'invalid');
  check('a trailing slash on a URL is caught', status(run({ APP_BASE_URL: 'https://my-roofing-app.vercel.app/' }), 'APP_BASE_URL') === 'invalid');
  check('http:// (not https) is caught', status(run({ APP_BASE_URL: 'http://my-roofing-app.vercel.app' }), 'APP_BASE_URL') === 'invalid');
  check('a short SESSION_SECRET is caught', status(run({ SESSION_SECRET: 'short' }), 'SESSION_SECRET') === 'invalid');
  check('.env.example placeholders are caught', status(run({ APP_BASE_URL: 'https://YOUR-DOMAIN' }), 'APP_BASE_URL') === 'placeholder');
  check('the new-style sb_secret_ key works as a service key', status(run({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abcdefghijklmnop' }), 'SUPABASE_SERVICE_ROLE_KEY') === 'ok');
  check('an sb_secret_ key in the public slot is caught', status(run({ VITE_SUPABASE_ANON_KEY: 'sb_secret_abcdefghijklmnop' }), 'VITE_SUPABASE_ANON_KEY') === 'invalid');
  check('a half-configured payments group is reported', run({ LS_API_KEY: undefined, LS_WEBHOOK_SECRET: 'whsec_12345678' }).problems.some((p) => /payments is half set up/.test(p)));
  check('a half-configured email group is reported', run({ EMAIL_PROVIDER_API_KEY: 're_abc' }).problems.some((p) => /email is half set up/.test(p)));
  check('unset optional features are not problems', run().problems.length === 0);
  check('no result ever contains a secret value', JSON.stringify(run().results).indexOf(good.SESSION_SECRET) === -1 && JSON.stringify(run().results).indexOf('service_role') === -1);

  // The standalone script carries its own copy of the catalog: the two must list the same variables.
  const { readFileSync } = await import('node:fs');
  const script = readFileSync(new URL('../scripts/verify-env.mjs', import.meta.url), 'utf8');
  const fromScript = [...script.matchAll(/\['([A-Z0-9_]+)', '(required|recommended|optional)', '([a-z-]+)'\]/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}`);
  const fromServer = ENV_CATALOG.map((e) => `${e.name}:${e.level}:${e.group}`);
  check('scripts/verify-env.mjs and api/_lib/envCheck.ts list the same variables', JSON.stringify(fromScript) === JSON.stringify(fromServer));
}

// ------------------------------------------------------------------
console.log(`\n==================================================`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log(failed === 0 ? 'ALL INTEGRATION CHECKS PASSED' : 'SOME CHECKS FAILED');
console.log(`==================================================`);
process.exit(failed === 0 ? 0 : 1);
