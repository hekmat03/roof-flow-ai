/**
 * lead-confirm.check.ts — double opt-in for widget leads.
 * Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/lead-confirm.check.ts
 */
import { readFileSync } from 'node:fs';
import { signLeadConfirmToken, verifyLeadConfirmToken, signUnsubscribeToken, verifyUnsubscribeToken } from '../api/_lib/email.ts';
import { sendLeadConfirmation, confirmLeadEmail, CONFIRM_LIMITS, type ConfirmSendStore, type ConfirmLeadStore } from '../api/_lib/emailConfirm.ts';
import { handleLeadsRequest } from '../api/_lib/leads.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };
const T = '11111111-2222-4333-8444-555555555555';
const L = '99999999-2222-4333-8444-555555555555';
const SECRET = 'test-secret';
const NOW = Date.parse('2026-11-10T10:00:00Z');

console.log('\n[1] tokens');
{
  const tok = signLeadConfirmToken({ leadId: L, tenantId: T, email: 'Home@Example.com', expiresAt: NOW + 1000 }, SECRET);
  const v = verifyLeadConfirmToken(tok, SECRET, NOW);
  check('valid token verifies and lowercases the email', v?.leadId === L && v.tenantId === T && v.email === 'home@example.com');
  check('tampered token rejected', verifyLeadConfirmToken(tok + 'x', SECRET, NOW) === null && verifyLeadConfirmToken(tok, 'other', NOW) === null);
  check('expired token rejected', verifyLeadConfirmToken(tok, SECRET, NOW + 1000) === null);
  const unsub = signUnsubscribeToken({ tenantId: T, email: 'home@example.com', expiresAt: NOW + 1000 }, SECRET);
  check('an unsubscribe token cannot confirm an email', verifyLeadConfirmToken(unsub, SECRET, NOW) === null);
  check('a confirm token cannot unsubscribe', verifyUnsubscribeToken(tok, SECRET, NOW) === null);
}

function sendSetup(opts: { suppressed?: boolean; deny?: string; throwAllow?: boolean } = {}) {
  const keys: string[] = []; const sent: { to: string; text: string; subject: string }[] = [];
  const store: ConfirmSendStore = {
    async isSuppressed() { return opts.suppressed === true; },
    async companyInfo() { return { companyName: 'Acme Roofing', businessAddress: '1 Main St, Austin TX' }; },
    async allow(key) { if (opts.throwAllow) return false; keys.push(key); return !(opts.deny && key.startsWith(opts.deny)); },
  };
  const provider = { async send(m: { to: string; text: string; subject: string }) { sent.push(m); return { ok: true, id: 'p' }; } };
  const base = { store, provider, from: 'Acme <a@acme.example>', baseUrl: 'https://roof.example', sessionSecret: SECRET, lead: { id: L, tenantId: T, email: 'Home@Example.com' }, now: () => new Date(NOW) };
  return { base, keys, sent };
}

console.log('\n[2] sending the confirmation');
{
  const s = sendSetup();
  const r = await sendLeadConfirmation(s.base);
  const link = /https:\/\/roof\.example\/api\/confirm-email\?token=([^\s]+)/.exec(s.sent[0]?.text ?? '');
  const payload = link ? verifyLeadConfirmToken(decodeURIComponent(link[1]), SECRET, NOW) : null;
  check('sends one mail with a working confirm link', r.status === 'sent' && s.sent.length === 1 && s.sent[0].to === 'home@example.com' && payload?.leadId === L);
  check('three throttles consumed (email, tenant, global)', s.keys.length === 3 && s.keys[0].startsWith('confirm-email:') && s.keys[1] === `confirm-tenant:${T}` && s.keys[2] === 'confirm-all');
  check('raw email is not used as a limiter key', !s.keys.some((k) => k.includes('example.com')));
}
for (const deny of ['confirm-email:', 'confirm-tenant:', 'confirm-all']) {
  const s = sendSetup({ deny }); const r = await sendLeadConfirmation(s.base);
  check(`throttle "${deny}" blocks the send`, r.status === 'skipped' && s.sent.length === 0);
}
{
  const s = sendSetup({ throwAllow: true }); const r = await sendLeadConfirmation(s.base);
  check('limiter that cannot answer fails closed', r.status === 'skipped' && s.sent.length === 0);
}
{
  const s = sendSetup({ suppressed: true }); const r = await sendLeadConfirmation(s.base);
  check('unsubscribed address gets nothing', r.status === 'skipped' && s.sent.length === 0);
}
{
  const s = sendSetup(); const r = await sendLeadConfirmation({ ...s.base, provider: null });
  const r2 = await sendLeadConfirmation({ ...s.base, sessionSecret: undefined });
  check('no provider or secret: skipped, nothing sent', r.status === 'skipped' && r2.status === 'skipped' && s.sent.length === 0);
  const r3 = await sendLeadConfirmation({ ...s.base, lead: { ...s.base.lead, email: 'not-an-email' } });
  check('invalid email skipped', r3.status === 'skipped');
  check('limits are sane', CONFIRM_LIMITS.perEmailPerDay <= 3 && CONFIRM_LIMITS.perTenantPerDay <= 100);
}

console.log('\n[3] confirming');
function confirmSetup(row: { email: string | null; email_verified_at: string | null } | null) {
  const marked: string[] = [];
  const store: ConfirmLeadStore = { async getLead() { return row; }, async markVerified(_l, _t, e) { marked.push(e); } };
  return { store, marked };
}
const good = signLeadConfirmToken({ leadId: L, tenantId: T, email: 'home@example.com', expiresAt: NOW + 5000 }, SECRET);
{
  const c = confirmSetup({ email: 'home@example.com', email_verified_at: null });
  check('valid link marks the lead verified', (await confirmLeadEmail(c.store, good, SECRET, NOW)) === 'confirmed' && c.marked[0] === 'home@example.com');
}
{
  const c = confirmSetup({ email: 'home@example.com', email_verified_at: '2026-11-01T00:00:00Z' });
  check('second click is harmless', (await confirmLeadEmail(c.store, good, SECRET, NOW)) === 'already' && c.marked.length === 0);
}
{
  const c = confirmSetup({ email: 'changed@example.com', email_verified_at: null });
  check('link for an email that was since changed is invalid', (await confirmLeadEmail(c.store, good, SECRET, NOW)) === 'invalid' && c.marked.length === 0);
  const c2 = confirmSetup(null);
  check('missing lead is invalid', (await confirmLeadEmail(c2.store, good, SECRET, NOW)) === 'invalid');
  check('expired or forged token is invalid', (await confirmLeadEmail(c.store, good, SECRET, NOW + 9000)) === 'invalid' && (await confirmLeadEmail(c.store, 'x.y', SECRET, NOW)) === 'invalid' && (await confirmLeadEmail(c.store, good, undefined, NOW)) === 'invalid');
}

console.log('\n[4] public lead POST triggers confirmation without breaking capture');
{
  const widgetKey = 'wk_' + 'a'.repeat(32);
  const body = { widget_key: widgetKey, name: 'Sam Lee', phone: '5551234567', email: 'sam.lee@gmail.com', zip_code: '75024', roofing_need: 'hail damage on roof', consent: true, conversation: [] };
  const mk = (afterInsert?: () => Promise<void>) => {
    const calls: { tenantId: string; leadId: string; email: string | null }[] = [];
    const req = new Request('https://roof.example/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const deps = {
      configured: true, authenticate: async () => null,
      store: { resolveWidgetKey: async () => T, resolveUserTenant: async () => null, resolveWidgetKeyForTenant: async () => null, list: async () => [], insert: async () => ({ id: L, lead_score: 50 }) },
      afterInsert: async (i: { tenantId: string; leadId: string; email: string | null }) => { calls.push(i); if (afterInsert) await afterInsert(); },
    };
    return { req, deps, calls };
  };
  const a = mk(); const ra = await handleLeadsRequest(a.req, a.deps);
  check('hook receives tenant, lead id and email; response is 201', ra.status === 201 && a.calls.length === 1 && a.calls[0].leadId === L && a.calls[0].email === 'sam.lee@gmail.com' && a.calls[0].tenantId === T);
  const b = mk(async () => { throw new Error('boom'); }); const rb = await handleLeadsRequest(b.req, b.deps);
  check('a failing hook never fails the lead capture', rb.status === 201);
}

console.log('\n[5] migration + gating sources');
{
  const sql = readFileSync(new URL('../supabase/012_email_verification.sql', import.meta.url), 'utf8');
  check('SQL adds column, guard trigger, and verified-only queue policy', /add column if not exists email_verified_at/.test(sql) && /leads_guard_email_verified/.test(sql) && /l\.email_verified_at is not null/.test(sql));
  check('SQL: only service_role can set it, email change clears it, no ilike wildcard test', /service_role/.test(sql) && /new\.email_verified_at := null/.test(sql) && !/ilike/.test(sql.replace(/--.*$/gm, '')));
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  check('agent tool path requires verification', /data\?\.email_verified_at != null && turns\.some/.test(read('../api/agent-run.ts')));
  check('cron worker requires verification', /lead\.email_verified_at != null/.test(read('../api/cron/send-followups.ts')));
  check('sequence endpoint requires verification', /code: 'email_not_verified'/.test(read('../api/followups.ts')));
}

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL LEAD CONFIRM CHECKS PASSED');
