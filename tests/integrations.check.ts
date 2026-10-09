/**
 * integrations.check.ts — unit-ish verification for the real-integrations
 * tier: aiService graceful degradation, webhook no-op/tolerance, and Web
 * Speech feature detection (bare mocks).
 *
 * Run: node --experimental-strip-types tests/integrations.check.ts
 */

import {
  callGroq,
  isGroqConfigured,
  setGroqApiKey,
  maskApiKey,
  GROQ_KEY_STORAGE,
} from '../src/utils/aiService.ts';
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
// 1. aiService — graceful degradation with NO key (no localStorage in node)
// ------------------------------------------------------------------
console.log('\n[1] aiService: no key configured');
check('isGroqConfigured() is false with no storage', (await isGroqConfigured()) === false);
let r1: string | null = 'sentinel';
try {
  r1 = await callGroq({ messages: [{ role: 'user', content: 'hello' }] });
} catch (e) {
  r1 = 'THREW: ' + String(e);
}
check('callGroq returns null (never throws) with no key', r1 === null);

// ------------------------------------------------------------------
// 2. aiService — masked key storage
// ------------------------------------------------------------------
console.log('\n[2] aiService: key storage + masking');
// Minimal localStorage stub (aiService only needs getItem/setItem/removeItem).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
setGroqApiKey('gsk_test_abcdef1234567890');
check('key stored under ' + GROQ_KEY_STORAGE, store.get(GROQ_KEY_STORAGE) === 'gsk_test_abcdef1234567890');
check('isGroqConfigured() true after set', isGroqConfigured());
const masked = maskApiKey('gsk_test_abcdef1234567890');
check('maskApiKey hides middle (no full key leak)', masked.startsWith('gsk_') && masked.includes('…') && masked.endsWith('7890') && !masked.includes('abcdef'));
check('maskApiKey of short key fully hides', maskApiKey('short') === '••••••••');
// Bad-key path against the real endpoint would need network; instead verify
// invalid-host failure returns null (network error path) — offline-safe.
store.set(GROQ_KEY_STORAGE, 'gsk_invalid_key_for_network_test');
const r2 = await callGroq({ messages: [{ role: 'user', content: 'hi' }] });
check('callGroq with unreachable/invalid API returns null (never throws)', r2 === null);
// clean up so later phases start unconfigured
store.delete(GROQ_KEY_STORAGE);

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
console.log(`\n==================================================`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log(failed === 0 ? 'ALL INTEGRATION CHECKS PASSED' : 'SOME CHECKS FAILED');
console.log(`==================================================`);
process.exit(failed === 0 ? 0 : 1);
