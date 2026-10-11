/**
 * integrations.check.ts — unit-ish verification for the real-integrations
 * tier: aiService graceful degradation, webhook no-op/tolerance, and Web
 * Speech feature detection (bare mocks).
 *
 * Run: node --experimental-strip-types tests/integrations.check.ts
 */

import { callAgentApi, fetchAiStatus } from '../src/utils/aiService.ts';
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
} from '../../site/src/lib/leads-core.ts';

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
console.log(`\n==================================================`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log(failed === 0 ? 'ALL INTEGRATION CHECKS PASSED' : 'SOME CHECKS FAILED');
console.log(`==================================================`);
process.exit(failed === 0 ? 0 : 1);
