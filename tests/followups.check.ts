import { readFileSync } from 'node:fs';
import { appOrigin, createResendProvider, emailEnvelope, signUnsubscribeToken, verifyUnsubscribeToken } from '../api/_lib/email.ts';
import { processDueMessages, scheduledSequenceTimes, sequenceEmailCopy, type FollowupStore, type ScheduledMessage, type SendContext } from '../api/_lib/followups.ts';
import { hasCronAuthorization } from '../api/_lib/cronAuth.ts';
import { applyUnsubscribe } from '../api/_lib/unsubscribe.ts';
import { hasBusinessAddress, normalizeBusinessAddress } from '../src/lib/businessAddress.ts';
import { makeFollowupEmailTemplates } from '../src/lib/followupTemplates.ts';
import { createEmailActions, type EmailActionStore } from '../api/_lib/emailActions.ts';
import { EMAIL_DAILY_CAP, EMAIL_MONTHLY_CAPS } from '../api/_lib/plans.ts';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${name}`); };
const TENANT = '11111111-1111-4111-8111-111111111111';
const BASE_TIME = Date.parse('2026-11-08T12:00:00.000Z');
const baseMessage = (over: Partial<ScheduledMessage> = {}): ScheduledMessage => ({
  id: 'm1', tenant_id: TENANT, lead_id: 'l1', to_email: 'homeowner@example.com',
  subject: 'Checking in', body: 'Reply if you need help.', send_at: new Date(BASE_TIME).toISOString(), status: 'pending',
  attempts: 0, idempotency_key: 'idem-1', sequence_key: 'seq-1', step: 1, ...over,
});
const baseContext = (over: Partial<SendContext> = {}): SendContext => ({
  plan: 'starter', leadStatus: 'New Lead', leadEmail: 'homeowner@example.com',
  emailWasProvidedByLead: true, suppressed: false, companyName: 'Acme Roofing',
  businessAddress: '100 Main Street, Austin, TX 78701', contractorEmail: 'owner@acme.example', ...over,
});

function fakeStore(messages: ScheduledMessage[], context: SendContext | null, opts: { suppressed?: boolean; blockedUsage?: boolean } = {}) {
  let claimed = 0;
  let usage = 0;
  const store: FollowupStore = {
    async claimDue(now, limit) {
      const selected = messages.filter(m => m.status === 'pending' && Date.parse(m.send_at) <= Date.parse(now)).slice(0, limit);
      selected.forEach(m => { m.status = 'sending'; m.attempts++; });
      claimed += selected.length;
      return selected.map(m => ({ ...m }));
    },
    async getContext() { return context ? { ...context, suppressed: context.suppressed || Boolean(opts.suppressed) } : null; },
    async reserveUsage() { if (opts.blockedUsage) return false; usage++; return true; },
    async releaseUsage() { usage = Math.max(0, usage - 1); },
    async update(id, patch) { const row = messages.find(m => m.id === id); if (row) Object.assign(row, patch); },
  };
  return { store, messages, get claimed() { return claimed; }, get usage() { return usage; } };
}

console.log('\n[1] address requirement and follow-up dates');
check('blank and short addresses fail; normalized full address passes', !hasBusinessAddress('   ') && !hasBusinessAddress('123 Main') && hasBusinessAddress('  100  Main Street, Austin, TX 78701  '));
check('address normalization trims and collapses whitespace', normalizeBusinessAddress('  100  Main\nStreet ') === '100 Main Street');
check('unsubscribe URL base accepts HTTPS and local dev but rejects unsafe schemes', appOrigin('https://roof.example/path') === 'https://roof.example' && appOrigin('http://localhost:3000') === 'http://localhost:3000' && appOrigin('javascript:alert(1)') === null);
const start = new Date(BASE_TIME);
const times = scheduledSequenceTimes(start);
check('sequence schedules at Day 1, Day 2, Day 4, and Day 7', times.map(d => (d.getTime() - start.getTime()) / 86_400_000).join(',') === '1,2,4,7');
check('sequence subjects and bodies are defined for each scheduled day', [1, 2, 4, 7].every(day => sequenceEmailCopy(day as 1 | 2 | 4 | 7, 'Sam').body.startsWith('Hi Sam,\n\n')));
const editableTemplates = makeFollowupEmailTemplates('Sam Lee', 'Acme Roofing', 'Austin');
check('editable email drafts use the homeowner, company, city, and free inspection invite', [1, 2, 4, 7].every(day => {
  const body = editableTemplates[day as 1 | 2 | 4 | 7].body;
  return body.includes('Sam Lee') && body.includes('Acme Roofing') && body.includes('Austin') && /free .*inspection/i.test(body);
}));
check('email drafts contain no invented storm date or insurance deadline', !Object.values(editableTemplates).some(draft => /storm|12 months|filing deadline|insurance deadline/i.test(`${draft.subject}\n${draft.body}`)));
check('plan caps are Free 0, Starter 200, Pro 1000 monthly and 100 daily', EMAIL_MONTHLY_CAPS.free === 0 && EMAIL_MONTHLY_CAPS.starter === 200 && EMAIL_MONTHLY_CAPS.pro === 1000 && EMAIL_DAILY_CAP === 100);

console.log('\n[2] queue worker policy and atomic claims');
{
  const db = fakeStore([baseMessage()], baseContext({ businessAddress: null }));
  const result = await processDueMessages({ store: db.store, provider: { send: async () => ({ ok: true, id: 'sent' }) }, from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret', now: () => new Date(BASE_TIME) });
  check('scheduled send is cancelled when business address is missing', result.cancelled === 1 && db.messages[0].status === 'cancelled');
}
{
  const db = fakeStore([baseMessage()], baseContext());
  let sent = 0;
  const provider = { send: async () => { sent++; return { ok: true, id: 'sent-1' }; } };
  const opts = { store: db.store, provider, from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret', now: () => new Date(BASE_TIME) };
  const [a, b] = await Promise.all([processDueMessages(opts), processDueMessages(opts)]);
  check('one concurrent worker claims and sends a due message once', sent === 1 && a.sent + b.sent === 1 && db.messages[0].status === 'sent');
}
{
  const db = fakeStore([baseMessage()], baseContext({ plan: 'free' }));
  const result = await processDueMessages({ store: db.store, provider: { send: async () => ({ ok: true }) }, from: 'a@b.example', baseUrl: 'https://roof.example', sessionSecret: 'secret', now: () => new Date(BASE_TIME) });
  check('Free plan is blocked', result.cancelled === 1 && db.messages[0].status === 'cancelled');
}
{
  const db = fakeStore([baseMessage()], baseContext({ leadStatus: 'Do Not Contact' }));
  const result = await processDueMessages({ store: db.store, provider: { send: async () => ({ ok: true }) }, from: 'a@b.example', baseUrl: 'https://roof.example', sessionSecret: 'secret', now: () => new Date(BASE_TIME) });
  check('Do Not Contact lead is cancelled', result.cancelled === 1 && db.messages[0].status === 'cancelled');
}
{
  const db = fakeStore([baseMessage()], baseContext(), { suppressed: true });
  const result = await processDueMessages({ store: db.store, provider: { send: async () => ({ ok: true }) }, from: 'a@b.example', baseUrl: 'https://roof.example', sessionSecret: 'secret', now: () => new Date(BASE_TIME) });
  check('suppressed address is cancelled', result.cancelled === 1 && db.messages[0].status === 'cancelled');
}
{
  const db = fakeStore([baseMessage()], baseContext(), { blockedUsage: true });
  const result = await processDueMessages({ store: db.store, provider: { send: async () => ({ ok: true }) }, from: 'a@b.example', baseUrl: 'https://roof.example', sessionSecret: 'secret', now: () => new Date(BASE_TIME) });
  check('daily or monthly cap is enforced before provider call', result.cancelled === 1 && db.usage === 0);
}

console.log('\n[3] retries, footer, provider, and configuration');
{
  const db = fakeStore([baseMessage()], baseContext());
  let calls = 0;
  const provider = { send: async () => { calls++; return calls < 3 ? { ok: false, error: 'temporary' } : { ok: false, error: 'final' }; } };
  const options = { store: db.store, provider, from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret' };
  const first = await processDueMessages({ ...options, now: () => new Date(BASE_TIME) });
  const second = await processDueMessages({ ...options, now: () => new Date(Date.parse(db.messages[0].send_at)) });
  const third = await processDueMessages({ ...options, now: () => new Date(Date.parse(db.messages[0].send_at)) });
  check('provider failures back off and stop after three attempts', first.deferred === 1 && second.deferred === 1 && third.failed === 1 && db.messages[0].status === 'failed' && calls === 3);
}
{
  let requestHeaders: Headers | undefined;
  let providerPayload: Record<string, unknown> = {};
  const provider = createResendProvider('test-key', async (_url, init) => {
    requestHeaders = new Headers(init?.headers);
    providerPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response('{"id":"mail-1"}', { status: 200 });
  });
  const envelope = emailEnvelope({
    from: 'Acme <mail@acme.example>', to: 'homeowner@example.com', subject: 'Hello', body: 'A note',
    companyName: 'Acme Roofing', businessAddress: '100 Main Street, Austin, TX 78701',
    unsubscribeUrl: 'https://roof.example/api/unsubscribe?token=x', idempotencyKey: 'mail-1',
  });
  const response = await provider!.send(envelope);
  const providerHeaders = providerPayload.headers as Record<string, string> | undefined;
  check('footer and one-click unsubscribe headers are present', response.ok && /100 Main Street, Austin, TX 78701/.test(envelope.text) && Boolean(providerHeaders?.['List-Unsubscribe']) && providerHeaders?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click' && Boolean(requestHeaders?.get('authorization')));
}

function fakeEmailActionStore(businessAddress: string | null): { store: EmailActionStore; scheduled: Record<string, unknown>[]; sent: Record<string, unknown>[]; recorded: Record<string, unknown>[] } {
  const scheduled: Record<string, unknown>[] = [], sent: Record<string, unknown>[] = [], recorded: Record<string, unknown>[] = [];
  const store: EmailActionStore = {
    async getProfile() { return { companyName: 'Acme Roofing', contractorEmail: 'owner@acme.example', businessAddress }; },
    async findLead(email) { return { id: 'lead-1', email, status: 'New Lead', consent: true, emailWasProvidedByLead: true }; },
    async isSuppressed() { return false; }, async reserveUsage() { return true; }, async releaseUsage() {},
    async insertMessage(row) { sent.push(row); return { id: 'message-1' }; },
    async insertScheduled(row) { scheduled.push(row); return { id: 'scheduled-1' }; },
    async updateLeadNote() {},
    async recordOnly(_table, row) { recorded.push(row); return { id: 'recorded-1' }; },
  };
  return { store, scheduled, sent, recorded };
}
type EmailMessageCapture = { to: string; replyTo?: string; text: string; headers?: Record<string, string> };

console.log('\n[3b] address-required bulk scheduling and address-optional single replies');
{
  const missing = fakeEmailActionStore(null);
  const failedSchedule = createEmailActions({ store: missing.store, provider: { send: async () => ({ ok: true }) }, from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret', tenantId: TENANT, sessionId: 's1', plan: 'starter', now: () => new Date(BASE_TIME) });
  const blocked = await failedSchedule.scheduleEmail({ contact: 'homeowner@example.com', whenHours: 24, hint: '' });
  check('bulk schedule is blocked without a business mailing address', !blocked.ok && missing.scheduled.length === 0);

  const valid = fakeEmailActionStore('100 Main Street, Austin, TX 78701');
  const scheduled = createEmailActions({ store: valid.store, provider: { send: async () => ({ ok: true }) }, from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret', tenantId: TENANT, sessionId: 's2', plan: 'starter', now: () => new Date(BASE_TIME) });
  const queued = await scheduled.scheduleEmail({ contact: 'homeowner@example.com', whenHours: 24, hint: '' });
  check('bulk schedule is allowed with a trimmed valid business address', queued.ok && queued.status === 'scheduled' && valid.scheduled.length === 1);

  const singleStore = fakeEmailActionStore(null);
  const captured: EmailMessageCapture[] = [];
  const single = createEmailActions({
    store: singleStore.store,
    provider: { async send(message) { captured.push(message); return { ok: true, id: 'single-1' }; } },
    from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret', tenantId: TENANT, sessionId: 's3', plan: 'starter', now: () => new Date(BASE_TIME),
  });
  const sent = await single.sendEmail({ to: 'homeowner@example.com', subject: 'Reply', body: 'Here is the information you requested.' });
  check('single reply is allowed without a business address and uses contractor Reply-To', sent.ok && sent.status === 'sent' && captured[0]?.replyTo === 'owner@acme.example' && /Acme Roofing/.test(captured[0]?.text ?? ''));
}
{
  let claims = 0;
  const store = fakeStore([baseMessage()], baseContext());
  const result = await processDueMessages({ store: { ...store.store, async claimDue() { claims++; return []; } }, provider: null, from: undefined, baseUrl: 'https://roof.example', sessionSecret: 'secret' });
  check('missing provider configuration does not claim or send queued messages', result.claimed === 0 && claims === 0);
}
{
  const testStore = fakeEmailActionStore('100 Main Street, Austin, TX 78701');
  const actions = createEmailActions({ store: testStore.store, provider: null, from: undefined, baseUrl: 'https://roof.example', sessionSecret: 'secret', tenantId: TENANT, sessionId: 's4', plan: 'starter', now: () => new Date(BASE_TIME) });
  const result = await actions.sendEmail({ to: 'homeowner@example.com', subject: 'Reply', body: 'A reply.' });
  check('missing provider config records a single email intent without sending', result.ok && result.status === 'recorded_only' && testStore.recorded.length === 1 && testStore.sent.length === 0);
}

console.log('\n[4] unsubscribe token, endpoint policy, and onboarding stability');
const token = signUnsubscribeToken({ tenantId: TENANT, email: 'homeowner@example.com', expiresAt: BASE_TIME + 60_000 }, 'secret');
check('valid unsubscribe token verifies', verifyUnsubscribeToken(token, 'secret', BASE_TIME)?.email === 'homeowner@example.com');
check('tampered and expired unsubscribe tokens are rejected', !verifyUnsubscribeToken(`${token}x`, 'secret', BASE_TIME) && !verifyUnsubscribeToken(token, 'secret', BASE_TIME + 60_000));
check('cron requires the bearer secret', hasCronAuthorization('Bearer cron-secret', 'cron-secret') && !hasCronAuthorization(undefined, 'cron-secret') && !hasCronAuthorization('Bearer wrong', 'cron-secret'));
{
  let suppressed = '';
  let cancelled = 0;
  await applyUnsubscribe({ async suppressAndCancel(_tenant, email) { suppressed = email; cancelled++; } }, { tenantId: TENANT, email: ' HOMEOWNER@EXAMPLE.COM ' });
  check('unsubscribe stores normalized suppression and cancels pending mail', suppressed === 'homeowner@example.com' && cancelled === 1);
}
{
  const source = readFileSync(new URL('../src/lib/onboarding.ts', import.meta.url), 'utf8');
  const current = source.slice(source.indexOf('export async function isOnboardingComplete('));
  check('onboarding completion still depends only on onboarding_complete', current.includes(".select('onboarding_complete')") && current.includes('data?.onboarding_complete === true') && !current.includes('business_address'));
}
{
  const agent3 = readFileSync(new URL('../src/components/Agent3EmailFollowups.tsx', import.meta.url), 'utf8');
  const agent4 = readFileSync(new URL('../src/components/Agent4Estimate.tsx', import.meta.url), 'utf8');
  check('Agent 3 selects real email leads and has no fake lead or reply simulator', agent3.includes('leads.filter') && agent3.includes("'sequence'") && !agent3.includes('addLead(') && !agent3.includes('Sequence Trigger Simulator') && !agent3.includes('SMS preview'));
  check('Agent 4 test chat does not create CRM leads', agent4.includes('Test the agent') && !agent4.includes('addLead(') && !agent4.includes('setLeads('));
}
{
  const sql = readFileSync(new URL('../supabase/009_followups.sql', import.meta.url), 'utf8');
  const scheduleDaysSql = readFileSync(new URL('../supabase/010_followup_schedule_days.sql', import.meta.url), 'utf8');
  check('address migration is nullable and idempotent', /add column if not exists business_address text/i.test(sql) && !/business_address text not null/i.test(sql));
  check('sequence step migration preserves legacy Day 3 and allows requested days', /step in \(1, 2, 3, 4, 7\)/i.test(scheduleDaysSql));
  check('queue and suppression RLS are tenant-owned', /scheduled_messages_own_select[\s\S]*tenant_id = public\.my_tenant\(\)/i.test(sql) && /email_suppressions_own_select[\s\S]*tenant_id = public\.my_tenant\(\)/i.test(sql));
  check('unsubscribe SQL suppresses and cancels pending recipient mail', /insert into public\.email_suppressions[\s\S]*update public\.scheduled_messages[\s\S]*status = 'cancelled'[\s\S]*status = 'pending'/i.test(sql));
  check('claims skip locked rows and usage reservation uses a tenant lock', /for update skip locked/i.test(sql) && /pg_advisory_xact_lock/i.test(sql));
}

console.log(`\nFollow-up checks: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
