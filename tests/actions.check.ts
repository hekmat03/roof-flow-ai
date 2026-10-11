/**
 * actions.check.ts — verifies how executed agent actions update the CRM.
 * Run: node --experimental-strip-types tests/actions.check.ts
 */
import { applyActionsToLeads, type AgentAction } from '../src/lib/applyActions.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };
const ok = (status: string, extra: Record<string, unknown> = {}) => ({ ok: true, status, simulated: false, persisted: true, ...extra });
const now = new Date('2026-10-10T10:00:00Z');

const lead: any = {
  id: 'L1', name: 'Sam Lee', phone: '(555) 123-4567', email: 'sam@example.com', propertyOwnership: 'Owner',
  status: 'New Lead', zipCode: 'N/A', roofIssue: 'Storm damage assessment', agentType: 'Chatbot', chatLog: [],
};
const book: AgentAction = { tool: 'book_inspection', args: { name: 'Sam Lee', phone: '5551234567', preferred_time: 'Tuesday morning', address_or_zip: '12 Palm St', issue: 'hail damage' }, result: ok('requested') };

console.log('\n[1] book_inspection');
let out = applyActionsToLeads([lead], [book], now);
check('matches existing lead by phone digits (no duplicate)', out.length === 1);
check('status Inspection Scheduled with REQUESTED/pending wording', out[0].status === 'Inspection Scheduled' && /REQUESTED/.test(out[0].appointmentDetails!.notes!) && /pending/.test(out[0].chatLog[0].text));
check('never invents a confirmed date', out[0].appointmentDetails!.date === 'TBC');
check('updates zip/issue from the booking', out[0].zipCode === '12 Palm St' && out[0].roofIssue === 'hail damage');
out = applyActionsToLeads([], [book], now);
check('creates a lead when none exists', out.length === 1 && out[0].phone === '5551234567' && out[0].status === 'Inspection Scheduled');

console.log('\n[2] failures + messaging');
out = applyActionsToLeads([lead], [{ ...book, result: { ok: false, status: 'failed', simulated: false, persisted: false, error: 'x' } }], now);
check('failed actions change nothing', out[0].status === 'New Lead' && out[0].chatLog.length === 0);
out = applyActionsToLeads([lead], [{ tool: 'send_message', args: { channel: 'sms', to: '5551234567', body: 'See you Tuesday' }, result: { ...ok('simulated_sent'), simulated: true } }], now);
check('sim SMS logged as demo / not delivered', /demo, not delivered/.test(out[0].chatLog[0].text));
out = applyActionsToLeads([lead], [{ tool: 'send_message', args: { channel: 'sms', to: '9990001111', body: 'hello there' }, result: ok('sent') }], now);
check('message for unknown lead is ignored', out[0].chatLog.length === 0);

console.log('\n[3] CRM + follow-up');
out = applyActionsToLeads([lead], [{ tool: 'update_crm', args: { phone: '5551234567', status: 'Do Not Contact' }, result: ok('updated') }], now);
check('Do Not Contact → Closed-Lost with note', out[0].status === 'Closed-Lost' && /DO NOT CONTACT/.test(out[0].chatLog[0].text));
out = applyActionsToLeads([lead], [{ tool: 'schedule_followup', args: { channel: 'email', contact: 'sam@example.com', when_hours: 24 }, result: ok('scheduled') }], now);
check('follow-up matched by email → Follow-up Nurture', out[0].status === 'Follow-up Nurture' && /24h/.test(out[0].chatLog[0].text));
check('input array is not mutated', lead.status === 'New Lead' && lead.chatLog.length === 0);

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL ACTION CHECKS PASSED');
