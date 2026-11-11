/**
 * email-send-consent.check.ts — single-email tool must only reach consented leads.
 * Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/email-send-consent.check.ts
 */
import { createEmailActions, type EmailActionStore, type OutreachLead } from '../api/_lib/emailActions.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };
const TENANT = '11111111-2222-4333-8444-555555555555';

function setup(lead: OutreachLead | null, opts: { suppressed?: boolean; reserve?: boolean } = {}) {
  const log = { sentRows: [] as Record<string, unknown>[], notes: [] as string[], reserved: 0, released: 0, providerCalls: 0 };
  const store: EmailActionStore = {
    async getProfile() { return { companyName: 'Acme Roofing', contractorEmail: 'owner@acme.example', businessAddress: null }; },
    async findLead() { return lead; },
    async isSuppressed() { return opts.suppressed === true; },
    async reserveUsage() { log.reserved++; return opts.reserve !== false; },
    async releaseUsage() { log.released++; },
    async insertMessage(row) { log.sentRows.push(row); return { id: 'm1' }; },
    async insertScheduled() { return { id: 's1' }; },
    async updateLeadNote(_id, note) { log.notes.push(note); },
    async recordOnly() { return { id: 'r1' }; },
  };
  const actions = createEmailActions({
    store, provider: { async send() { log.providerCalls++; return { ok: true, id: 'p1' }; } },
    from: 'Acme <mail@acme.example>', baseUrl: 'https://roof.example', sessionSecret: 'secret',
    tenantId: TENANT, sessionId: `${TENANT}:s1`, plan: 'starter',
  });
  return { actions, log };
}
const good: OutreachLead = { id: 'L1', email: 'home@example.com', status: 'New Lead', consent: true, emailWasProvidedByLead: true };
const input = { to: 'home@example.com', subject: 'Reply', body: 'Here is the info.' };

console.log('\n[single email consent gate]');
{
  const t = setup(good);
  const r = await t.actions.sendEmail(input);
  check('consented lead is emailed and noted', r.ok && r.status === 'sent' && t.log.providerCalls === 1 && t.log.notes.length === 1);
}
{
  const t = setup(null);
  const r = await t.actions.sendEmail(input);
  check('address with no lead is refused; nothing sent or reserved', !r.ok && r.error === 'consented_lead_email_required' && t.log.providerCalls === 0 && t.log.reserved === 0);
}
{
  const t = setup({ ...good, consent: false });
  const r = await t.actions.sendEmail(input);
  check('lead without consent is refused', !r.ok && t.log.providerCalls === 0);
}
{
  const t = setup({ ...good, emailWasProvidedByLead: false });
  const r = await t.actions.sendEmail(input);
  check('email not supplied by the lead is refused', !r.ok && t.log.providerCalls === 0);
}
{
  const t = setup({ ...good, email: 'other@example.com' });
  const r = await t.actions.sendEmail(input);
  check('lead email that differs from recipient is refused', !r.ok && t.log.providerCalls === 0);
}
{
  const t = setup({ ...good, status: 'Do Not Contact' });
  const r = await t.actions.sendEmail(input);
  check('Do Not Contact / closed leads are refused', !r.ok && r.error === 'lead_not_eligible_for_email' && t.log.providerCalls === 0);
}
{
  const t = setup(good, { suppressed: true });
  const r = await t.actions.sendEmail(input);
  check('unsubscribed address is refused', !r.ok && t.log.providerCalls === 0);
}
{
  const t = setup(good, { reserve: false });
  const r = await t.actions.sendEmail(input);
  check('usage cap still enforced', !r.ok && r.error === 'email_usage_limit_reached' && t.log.providerCalls === 0);
}

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL EMAIL CONSENT CHECKS PASSED');
