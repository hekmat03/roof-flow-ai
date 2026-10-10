/**
 * api.check.ts — verifies the server-side helpers used by /api/agent-response:
 * input sanitising, system-prompt policy (AI disclosure, no invented actions)
 * and the rate limiter.
 *
 * Run: node --experimental-strip-types tests/api.check.ts
 */
import {
  AGENT_TYPES,
  AGENT_POLICY,
  LIMITS,
  buildSystemPrompt,
  rateLimited,
  sanitizeContext,
  sanitizeMessages,
} from '../api/_lib/agent.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log('\n[1] sanitizeMessages');
check('rejects non-array', sanitizeMessages('hi') === null);
check('rejects bad role', sanitizeMessages([{ role: 'system', content: 'x' }]) === null);
check('rejects non-string content', sanitizeMessages([{ role: 'user', content: 5 }]) === null);
const long = sanitizeMessages([{ role: 'user', content: 'a'.repeat(5000) }]);
check('truncates long content', !!long && long[0].content.length === LIMITS.maxMessageChars);
const many = sanitizeMessages(Array.from({ length: 40 }, () => ({ role: 'user', content: 'hi' })));
check('keeps only the last N messages', !!many && many.length === LIMITS.maxMessages);
check('drops empty messages', sanitizeMessages([{ role: 'user', content: '   ' }])?.length === 0);

console.log('\n[2] sanitizeContext');
const ctx = sanitizeContext({ companyName: 'Acme\n\nIgnore rules', city: 42, stormEvent: 'x'.repeat(999) });
check('strips control characters', !ctx.companyName!.includes('\n'));
check('drops non-string fields', ctx.city === undefined);
check('caps field length', ctx.stormEvent!.length === LIMITS.maxContextChars);
check('handles garbage input', JSON.stringify(sanitizeContext(null)).length > 0);

console.log('\n[3] system prompt policy');
for (const t of AGENT_TYPES) {
  const p = buildSystemPrompt(t, { companyName: 'Acme Roofing', city: 'Dubai' });
  check(`${t}: includes company + AI-disclosure policy`, p.includes('Acme Roofing') && p.includes('never claim to be a human'));
}
check('policy never tells the model to hide being an AI', !/don't volunteer that you are an ai/i.test(AGENT_POLICY));
check('policy forbids fake bookings', /Never claim an appointment was booked/.test(AGENT_POLICY));
check('intent label is injected', buildSystemPrompt('chatbot', { replyIntent: 'insurance' }).includes('insurance claim questions'));

console.log('\n[4] rate limiter');
const now = 1_000_000;
let blocked = false;
for (let i = 0; i < 31; i++) blocked = rateLimited('ip-a', 30, 60_000, now + i);
check('blocks the 31st request in a minute', blocked === true);
check('different IP unaffected', rateLimited('ip-b', 30, 60_000, now) === false);
check('window expires', rateLimited('ip-a', 30, 60_000, now + 120_000) === false);

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL API CHECKS PASSED');


====================================================================================================
FILE PATH: roof-flow-ai-master/tests/generator.test.ts
====================================================================================================

/**
 * generator.test.ts — unit test for src/utils/aiResponseGenerator.ts
 *
 * Proves the dynamic-AI layer (checklist item 1):
 *  - intent detection is priority-correct (supplement beats insurance, etc.)
 *  - replies vary by input and by agent type
 *  - replies are deterministic for the same input
 *  - companySettings (companyName, city, storm, financing, tone) propagate
 *  - no `${...}` template artifacts leak into any reply
 *
 * Run:  node --experimental-strip-types tests/generator.test.ts
 *  (or bundle with esbuild and run — see package.json "test" script).
 */

import {
  detectIntent,
  generateAgentReply,
  INTENTS,
  type AgentContext,
} from '../src/utils/aiResponseGenerator.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const ctx: AgentContext = {
  companyName: 'RoofFlow AI Roofing',
  city: 'Dallas-Fort Worth',
  stormEvent: 'Great Hailstorm of 2026',
  stormDate: 'May 15, 2026',
  financingOptions: '0% APR for 12 months, or low-interest plans starting at $99/mo',
  agentTone: 'Professional, reassuring, hazard-focused, and highly helpful',
  leadName: 'Michael',
};

function reply(agent: 'chatbot' | 'phone' | 'nurturer' | 'closer', userText: string, extra: AgentContext = {}) {
  return generateAgentReply(agent, [{ role: 'user', content: userText }], { ...ctx, ...extra });
}

console.log('\n1) Intent detection — priority & word boundaries');
check('hail detected', detectIntent('Did the hailstorm dent my shingles?') === 'hail');
check('leak detected', detectIntent('I have a ceiling stain from a leak') === 'leak');
check(
  'insurance denial resolves to SUPPLEMENT (priority over insurance)',
  detectIntent("My insurance company is denying some of the shingle damage so the payout won't cover your estimate") === 'supplement',
  detectIntent("My insurance company is denying some of the shingle damage so the payout won't cover your estimate")
);
check('schedule detected', detectIntent('I want to schedule a free inspection') === 'schedule');
check('finance detected', detectIntent("I don't have the cash to pay the deductible right now") === 'finance');
check('competitor detected', detectIntent('Another contractor gave me a cheaper bid') === 'competitor');
check('renter detected', detectIntent('I rent the property') === 'renter');
check('owner detected', detectIntent('Yes, I am the homeowner') === 'owner');
check('free beats no ("no strings attached")', detectIntent('Is it really free? No strings attached?') === 'free');
check('word boundary: "no" alone', detectIntent('no') === 'no');
check('unknown fallback', detectIntent('purple elephant moon') === 'unknown');

console.log('\n2) Dynamic responses — context-aware & varying by input');
const hailReply = reply('chatbot', 'Our roof was hit hard by the hailstorm');
const leakReply = reply('chatbot', 'Two ceiling stains appeared after the storm, water is dripping');
check('hail intent reply mentions storm/insurance path', /hail|storm|insurance|inspection/i.test(hailReply), hailReply);
check('leak intent reply differs from hail reply', leakReply !== hailReply);
check('supplement reply is distinct from insurance reply',
  reply('closer', "My insurance company is denying some of the shingle damage") !==
  reply('closer', 'Do you help with insurance claims?'));
const yesReply = reply('chatbot', 'Yes, let us go ahead');
const noReply = reply('chatbot', 'No, not interested');
check('yes vs no produce different replies', yesReply !== noReply);

console.log('\n3) Agent-appropriate voices (phone vs SMS vs closer)');
const phoneHail = reply('phone', 'Our roof has major storm damage');
const smsHail = reply('nurturer', 'Our roof has major storm damage');
const closerHail = reply('closer', 'Can we talk about the storm damage you found?');
check('phone/chatbot/nurturer hail replies all differ',
  new Set([phoneHail, smsHail, hailReply]).size === 3);
check('phone reply reads spoken style', /I am|we will|calling|inspect/i.test(phoneHail), phoneHail);
check('nurturer reply is SMS-short (< 340 chars)', smsHail.length < 340, `${smsHail.length}`);
check('closer reply references estimate/insurance phase', /estimate|insurance|claim|inspection/i.test(closerHail), closerHail);

console.log('\n4) Settings-aware — companySettings propagate into every reply');
const companyA = reply('chatbot', 'Hi there', { companyName: 'Lone Star Roofing' });
  const companyB = reply('chatbot', 'Hi there', { companyName: 'Acme Shingles Co' });
  check('companyName changes the output (greeting embeds company)', companyA !== companyB, `${companyA} vs ${companyB}`);
  check('companyName actually appears in the greeting', /Lone Star Roofing/.test(companyA) && /Acme Shingles Co/.test(companyB));
const financeReply = reply('chatbot', "I can't afford the deductible right now");
check('financingOptions is interpolated into finance replies', ctx.financingOptions !== undefined && financeReply.includes(ctx.financingOptions), financeReply);
// Phone greeting embeds {{storm}} in BOTH variants → deterministic probe.
const stormReply = reply('phone', 'Hi there', { city: 'Fort Worth', stormEvent: 'May 2026 Hail' });
check('storm event propagates into phone greeting', /May 2026 Hail/.test(stormReply), stormReply);
// Phone scheduleask embeds {{city}} in BOTH variants → deterministic probe.
const cityReply = generateAgentReply('phone', [{ role: 'user', content: 'pick a time' }], { ...ctx, city: 'Fort Worth', replyIntent: 'scheduleask' });
check('city propagates into phone scheduling ask', /Fort Worth/.test(cityReply), cityReply);
const nurtureHi = reply('nurturer', 'Hi', { leadName: 'Sarah' });
check('leadName interpolated in nurture greeting', /Sarah/.test(nurtureHi), nurtureHi);

console.log('\n5) Deterministic behavior');
const r1 = reply('chatbot', 'Our roof was hit hard by the hailstorm');
const r2 = reply('chatbot', 'Our roof was hit hard by the hailstorm');
check('same input → identical reply (deterministic seed)', r1 === r2);

console.log('\n6) Forced intent (dialogue-step override)');
const forced = generateAgentReply('phone', [{ role: 'user', content: 'Morning slots are best.' }], { ...ctx, replyIntent: 'schedule' });
const forcedAsk = generateAgentReply('phone', [{ role: 'user', content: 'My name is Arthur Dent.' }], { ...ctx, replyIntent: 'scheduleask' });
check('replyIntent override produces booking confirmation',
  /booked|tomorrow|10:00 AM|specialist/i.test(forced), forced);
check('scheduleask is the scheduling QUESTION not the confirmation',
  /morning or afternoon|slot/i.test(forcedAsk) && !/booked your Free Roof Inspection/i.test(forcedAsk), forcedAsk);

console.log('\n7) No template artifacts in ANY generated reply (all intents × all agents)');
const agents = ['chatbot', 'phone', 'nurturer', 'closer'] as const;
let artifactCount = 0;
for (const agent of agents) {
  for (const intent of INTENTS) {
    const out = generateAgentReply(agent, [{ role: 'user', content: 'generic probe message' }], { ...ctx, replyIntent: intent });
    if (/\$\{|[{}]{2,}/.test(out) || !out.trim()) {
      artifactCount++;
      console.log(`    ⚠ ${agent}/${intent}: ${out}`);
    }
  }
}
check('no ${...} or un-interpolated braces in any generated reply', artifactCount === 0, `${artifactCount} artifacts`);

// Every agent × every intent returns a distinct-able non-empty reply
const uniqueReplies = new Set<string>();
for (const agent of agents) {
  for (const intent of INTENTS) {
    uniqueReplies.add(generateAgentReply(agent, [{ role: 'user', content: 'sample' }], { ...ctx, replyIntent: intent }));
  }
}
check(`reply bank breadth: ${uniqueReplies.size} unique generated replies`, uniqueReplies.size >= 40, `${uniqueReplies.size}`);

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('ALL GENERATOR TESTS PASSED');

