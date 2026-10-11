/**
 * tools.check.ts — verifies the tool-calling layer: argument validation,
 * guardrails (customer-provided contacts only, opt-outs, honest status),
 * Supabase/Resend adapters and the bounded agent loop. Fully offline (mocks).
 * Run: node --experimental-strip-types tests/tools.check.ts
 */
import {
  collectAllowedContacts, createSupabase, executeTool, runToolLoop, toolSpecsFor, validateToolArgs, TOOL_SETS,
  type ChatFn, type ToolEnv, type Supabase,
} from '../api/_lib/tools.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };

const rows: { table: string; row: Record<string, unknown> }[] = [];
const mockDb: Supabase = {
  async insert(table, row) { rows.push({ table, row }); return { id: `id-${rows.length}` }; },
  async upsert(table, row) { rows.push({ table, row }); return { id: `id-${rows.length}` }; },
  async exists(table, _c, v) { return rows.some((r) => r.table === table && Object.values(r.row).includes(v)); },
};
const mkEnv = (over: Partial<ToolEnv> = {}): ToolEnv => ({
  db: null, sessionId: 'sess-12345678', optOuts: new Set(), allowedContacts: new Set(['5551234567', 'sam@example.com']), ...over,
});
const goodBook = { name: 'Sam Lee', phone: '(555) 123-4567', preferred_time: 'Tuesday morning', address_or_zip: '12 Palm St', issue: 'hail damage' };

console.log('\n[1] contact collection');
const c = collectAllowedContacts(['call me on +1 (555) 123-4567 or sam@Example.com'], ['x@y.io']);
check('finds phone (digits only)', c.has('15551234567'));
check('finds email (lowercased)', c.has('sam@example.com'));
check('adds CRM context contact', c.has('x@y.io'));
check('ignores short numbers', collectAllowedContacts(['zip 90210 and 12345']).size === 0);

console.log('\n[2] validation');
check('book: valid args pass', validateToolArgs('book_inspection', goodBook).ok);
check('book: bad phone rejected', !validateToolArgs('book_inspection', { ...goodBook, phone: '12' }).ok);
check('book: missing issue rejected', !validateToolArgs('book_inspection', { ...goodBook, issue: '' }).ok);
check('send: sms needs phone', !validateToolArgs('send_message', { channel: 'sms', to: 'a@b.co', body: 'hello there' }).ok);
check('send: bad channel rejected', !validateToolArgs('send_message', { channel: 'fax', to: '5551234567', body: 'hello there' }).ok);
check('crm: needs phone or email', !validateToolArgs('update_crm', { note: 'hi' }).ok);
check('crm: arbitrary status rejected', !validateToolArgs('update_crm', { phone: '5551234567', status: 'Closed-Won' }).ok);
check('followup: hours bounded', !validateToolArgs('schedule_followup', { channel: 'sms', contact: '5551234567', when_hours: 500 }).ok);
check('unknown tool rejected', !validateToolArgs('drop_tables', {}).ok);

console.log('\n[3] executors + guardrails');
let r = await executeTool('book_inspection', goodBook, mkEnv());
check('book without DB: ok, simulated, never "confirmed"', r.ok && r.simulated && !r.persisted && r.status === 'requested');
r = await executeTool('book_inspection', goodBook, mkEnv({ db: mockDb }));
check('book with DB: persisted', r.ok && r.persisted && !r.simulated && rows.at(-1)?.table === 'inspection_requests');
r = await executeTool('book_inspection', goodBook, mkEnv({ allowedContacts: new Set() }));
check('rejects contact the customer never provided', !r.ok && /not provided/.test(r.error || ''));
r = await executeTool('send_message', { channel: 'sms', to: '5551234567', body: 'See you Tuesday' }, mkEnv());
check('sms is always simulated (never claims delivery)', r.ok && r.simulated && r.status === 'simulated_sent');
r = await executeTool('send_message', { channel: 'email', to: 'sam@example.com', body: 'See you Tuesday' }, mkEnv());
check('email without provider key is simulated', r.ok && r.simulated);

let sent: any = null;
const fakeFetch = (async (url: string, init: any) => { sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization }; return { ok: true, json: async () => ({}) }; }) as any;
r = await executeTool('send_message', { channel: 'email', to: 'sam@example.com', body: 'See you Tuesday' }, mkEnv({ resendKey: 'rk_test', fetchFn: fakeFetch, companyName: 'Acme' }));
check('email with provider key is really sent', r.ok && !r.simulated && r.status === 'sent' && sent.url.includes('resend.com'));
check('email carries AI disclosure + STOP footer', /AI assistant/.test(sent.body.text) && /STOP/.test(sent.body.text));
check('provider key sent as bearer only', sent.auth === 'Bearer rk_test');
const failFetch = (async () => ({ ok: false, json: async () => ({}) })) as any;
r = await executeTool('send_message', { channel: 'email', to: 'sam@example.com', body: 'See you Tuesday' }, mkEnv({ resendKey: 'k', fetchFn: failFetch }));
check('provider failure reported as ok:false', !r.ok && r.error === 'email_provider_error');

const env = mkEnv({ db: mockDb });
r = await executeTool('update_crm', { phone: '5551234567', status: 'Do Not Contact' }, env);
check('opt-out recorded', r.ok && env.optOuts.has('5551234567'));
r = await executeTool('send_message', { channel: 'sms', to: '5551234567', body: 'Still there?' }, env);
check('opted-out contact can no longer be messaged', !r.ok && r.error === 'contact opted out');
r = await executeTool('schedule_followup', { channel: 'sms', contact: '5551234567', when_hours: 24 }, env);
check('opted-out contact cannot be scheduled', !r.ok);
r = await executeTool('schedule_followup', { channel: 'email', contact: 'sam@example.com', when_hours: 24 }, mkEnv({ db: mockDb }));
check('followup stored as "scheduled" (not sent)', r.ok && r.status === 'scheduled' && r.persisted);
rows.length = 0; // clear opt-outs recorded by earlier tests
const boomDb: Supabase = { ...mockDb, insert: async () => { throw new Error('storage 500'); } };
r = await executeTool('book_inspection', goodBook, mkEnv({ db: boomDb }));
check('storage error surfaces as ok:false', !r.ok && r.error === 'storage_error');

console.log('\n[3b] supabase adapter');
let call: any = null;
const sbFetch = (async (url: string, init: any) => { call = { url, init }; return { ok: true, json: async () => [{ id: 'abc' }] }; }) as any;
const sb = createSupabase('https://x.supabase.co/', 'srv_key', sbFetch)!;
const ins = await sb.insert('leads', { a: 1 });
check('insert hits /rest/v1/<table> with returned id', call.url === 'https://x.supabase.co/rest/v1/leads' && ins.id === 'abc');
check('uses key as apikey + bearer', call.init.headers.apikey === 'srv_key' && call.init.headers.Authorization === 'Bearer srv_key');
check('not configured → null', createSupabase('', '') === null);

console.log('\n[4] agent loop');
const specs = toolSpecsFor('chatbot');
check('chatbot only gets its own tools', specs.length === TOOL_SETS.chatbot.length && !specs.some((s: any) => s.function.name === 'send_message'));
let step = 0;
const scripted: ChatFn = async (_m, tools) => {
  step++;
  if (step === 1) return { tool_calls: [{ id: 't1', function: { name: 'book_inspection', arguments: JSON.stringify(goodBook) } }] };
  return { content: tools ? 'I submitted your request; the team will confirm.' : 'done' };
};
let out = await runToolLoop({ agentType: 'chatbot', systemPrompt: 'sys', messages: [{ role: 'user', content: 'book me' }], chat: scripted, env: mkEnv() });
check('loop executes tool then returns final reply', out.actions.length === 1 && out.actions[0].result.ok && /team will confirm/.test(out.reply));
const wrongTool: ChatFn = async () => ({ tool_calls: [{ id: 't', function: { name: 'send_message', arguments: '{}' } }], content: 'x' });
let calls = 0;
const stubborn: ChatFn = async (m, tools) => { calls++; return tools ? await wrongTool(m, tools) : { content: 'final' }; };
out = await runToolLoop({ agentType: 'chatbot', systemPrompt: 's', messages: [{ role: 'user', content: 'x' }], chat: stubborn, env: mkEnv() });
check('tool outside agent set is refused', out.actions.every((a) => !a.result.ok && /not available/.test(a.result.error || '')));
check('loop is bounded (rounds) and still returns a reply', calls <= 4 && out.reply === 'final');
const badJson: ChatFn = async (_m, tools) => tools ? { tool_calls: [{ id: 'b', function: { name: 'update_crm', arguments: '{oops' } }] } : { content: 'ok' };
out = await runToolLoop({ agentType: 'chatbot', systemPrompt: 's', messages: [{ role: 'user', content: 'x' }], chat: badJson, env: mkEnv() });
check('malformed JSON arguments handled safely', out.actions[0]?.result.error === 'arguments were not valid JSON');

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL TOOL CHECKS PASSED');
