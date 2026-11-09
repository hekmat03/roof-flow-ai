/**
 * agent-tenant.check.ts — chatbot/agent data belongs to ONE company, and a
 * customer's "do not contact" is durable, per company, and fails closed.
 * Fully offline. Run: node --experimental-strip-types --import ./tests/register-ts.mjs tests/agent-tenant.check.ts
 */
import { createSupabase, executeTool, scopedSessionId, type Supabase, type ToolEnv } from '../api/_lib/tools.ts';
import { lookupTenant, isUuid } from '../api/_lib/tenant.ts';

let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${n}`); };

const TENANT_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const PHONE = '5551234567';
const EMAIL = 'sam@gmail.com';

type Row = Record<string, unknown>;
/** In-memory database that behaves like the real one: upsert on a conflict key, tenant-aware opt-out lookup. */
const makeDb = () => {
  const tables: Record<string, Row[]> = {};
  let failOptOutCheck = false;
  const db: Supabase = {
    async insert(table, row) { (tables[table] ??= []).push(row); return { id: `id-${table}-${tables[table].length}` }; },
    async upsert(table, row, onConflict) {
      const keys = onConflict.split(',');
      const list = (tables[table] ??= []);
      const i = list.findIndex((r) => keys.every((k) => r[k] === row[k]));
      if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
      return { id: `id-${table}-${list.length}` };
    },
    async exists() { return false; },
    async optedOut(tenantId, contact) {
      if (failOptOutCheck) throw new Error('storage 500');
      return (tables.contact_optouts ?? []).some((r) => r.contact === contact && (r.tenant_id === tenantId || r.tenant_id == null));
    },
  };
  return { db, tables, breakOptOutCheck: () => { failOptOutCheck = true; } };
};

/** A fresh env each time = a cold start: nothing in memory, only the database remembers. */
const envFor = (db: Supabase, tenantId: string, over: Partial<ToolEnv> = {}): ToolEnv => ({
  db, tenantId, sessionId: scopedSessionId(tenantId, 'sess-12345678'), optOuts: new Set(),
  allowedContacts: new Set([PHONE, EMAIL]), customerProvidedContacts: new Set([PHONE, EMAIL]), ...over,
});
const book = { name: 'Sam Lee', phone: '(555) 123-4567', email: EMAIL, preferred_time: 'Tuesday', address_or_zip: '12 Palm St', issue: 'hail damage' };

console.log('\n[1] every row the agent writes carries the company');
{
  const { db, tables } = makeDb();
  const env = envFor(db, TENANT_A);
  await executeTool('book_inspection', book, env);
  await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'See you Tuesday' }, env);
  await executeTool('schedule_followup', { channel: 'email', contact: EMAIL, when_hours: 24 }, env);
  await executeTool('update_crm', { phone: PHONE, name: 'Sam Lee', note: 'hi there' }, env);
  await executeTool('update_crm', { phone: PHONE, email: EMAIL, status: 'Do Not Contact' }, env);
  for (const t of ['inspection_requests', 'messages', 'followups', 'leads', 'contact_optouts']) {
    const list = tables[t] ?? [];
    check(`${t}: rows written, all stamped with company A`, list.length > 0 && list.every((r) => r.tenant_id === TENANT_A));
  }
  check('stored session id is namespaced by company', (tables.messages[0].session_id as string).startsWith(`${TENANT_A}:`));
}

console.log('\n[2] opt-out is durable (survives a cold start)');
{
  const { db, tables } = makeDb();
  await executeTool('update_crm', { phone: PHONE, email: EMAIL, status: 'Do Not Contact' }, envFor(db, TENANT_A));
  const coldStart = envFor(db, TENANT_A); // empty in-memory set, like a fresh serverless instance
  check('cold-start env has nothing in memory', coldStart.optOuts.size === 0);
  const r = await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'Still there?' }, coldStart);
  check('opted-out contact is still blocked after a "restart"', !r.ok && r.error === 'contact opted out');
  check('nothing was written for the blocked message', (tables.messages ?? []).length === 0);
}

console.log('\n[3] opt-out stores BOTH phone and email');
{
  const { db, tables } = makeDb();
  await executeTool('update_crm', { phone: PHONE, email: EMAIL, status: 'Do Not Contact' }, envFor(db, TENANT_A));
  const stored = (tables.contact_optouts ?? []).map((r) => r.contact);
  check('phone and email are both recorded', stored.includes(PHONE) && stored.includes(EMAIL));
  const viaEmail = await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'Hello again' }, envFor(db, TENANT_A));
  check('opted out by phone → the same person is blocked by email too', !viaEmail.ok);
  const book2 = await executeTool('book_inspection', book, envFor(db, TENANT_A));
  check('booking is blocked for an opted-out contact', !book2.ok && book2.error === 'contact opted out');
}

console.log('\n[4] opt-outs are per company');
{
  const { db, tables } = makeDb();
  await executeTool('update_crm', { phone: PHONE, email: EMAIL, status: 'Do Not Contact' }, envFor(db, TENANT_A));
  const b = await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'Quick roof check?' }, envFor(db, TENANT_B));
  check("company A's opt-out does NOT block company B", b.ok);
  check("company B's message is stamped company B", (tables.messages ?? []).every((r) => r.tenant_id === TENANT_B));
  const a = await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'Quick roof check?' }, envFor(db, TENANT_A));
  check('company A is still blocked', !a.ok);
}

console.log('\n[5] legacy opt-outs (no company) still block everyone');
{
  const { db, tables } = makeDb();
  tables.contact_optouts = [{ contact: EMAIL, tenant_id: null }];
  const r = await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'Hello there' }, envFor(db, TENANT_B));
  check('an opt-out recorded before tenant scoping is honoured', !r.ok && r.error === 'contact opted out');
}

console.log('\n[6] fails CLOSED when the opt-out list cannot be read');
{
  const { db, tables, breakOptOutCheck } = makeDb();
  breakOptOutCheck();
  const send = await executeTool('send_message', { channel: 'email', to: EMAIL, body: 'Hello there' }, envFor(db, TENANT_A));
  const bookR = await executeTool('book_inspection', book, envFor(db, TENANT_A));
  const fu = await executeTool('schedule_followup', { channel: 'email', contact: EMAIL, when_hours: 24 }, envFor(db, TENANT_A));
  check('send_message blocked on storage error', !send.ok && send.error === 'storage_error');
  check('book_inspection blocked on storage error', !bookR.ok && bookR.error === 'storage_error');
  check('schedule_followup blocked on storage error', !fu.ok && fu.error === 'storage_error');
  check('nothing was written', Object.values(tables).every((l) => l.length === 0));
}

console.log('\n[7] no company → no action');
{
  const { db, tables } = makeDb();
  for (const bad of ['', 'not-a-uuid', '*']) {
    const r = await executeTool('book_inspection', book, envFor(db, bad));
    check(`tenantId ${JSON.stringify(bad)} is refused`, !r.ok && r.error === 'tenant_unresolved');
  }
  const sim = await executeTool('book_inspection', book, envFor(null as never, ''));
  check('refused even in simulated (no database) mode', !sim.ok);
  check('nothing was written', Object.values(tables).every((l) => l.length === 0));
}

console.log('\n[8] session ids cannot collide across companies');
{
  const a = scopedSessionId(TENANT_A, 'sess-12345678');
  const b = scopedSessionId(TENANT_B, 'sess-12345678');
  check('same client session id → different stored ids', a !== b);
  const { db, tables } = makeDb();
  await executeTool('update_crm', { phone: PHONE, name: 'Sam Lee' }, envFor(db, TENANT_A));
  await executeTool('update_crm', { phone: PHONE, name: 'Mallory' }, envFor(db, TENANT_B));
  check('company B cannot overwrite company A\'s lead row', (tables.leads ?? []).length === 2 && tables.leads.find((r) => r.tenant_id === TENANT_A)?.name === 'Sam Lee');
}

console.log('\n[9] real adapter: the opt-out query is company-scoped');
{
  let url = '';
  const fetchFn = (async (u: string) => { url = u; return { ok: true, json: async () => [] }; }) as never;
  const sb = createSupabase('https://x.supabase.co', 'srv', fetchFn)!;
  await sb.optedOut(TENANT_A, PHONE);
  check('filters on this company OR legacy (null)', url.includes(`tenant_id.eq.${TENANT_A}`) && url.includes('tenant_id.is.null'));
  let threw = false;
  try { await sb.optedOut('x&or=(a.eq.b)', PHONE); } catch { threw = true; }
  check('a malformed tenant id is rejected (no filter injection)', threw);
  const failing = createSupabase('https://x.supabase.co', 'srv', (async () => ({ ok: false, status: 500, json: async () => ({}) })) as never)!;
  let failedClosed = false;
  try { await failing.optedOut(TENANT_A, PHONE); } catch { failedClosed = true; }
  check('a storage error throws (callers fail closed)', failedClosed);
}

console.log('\n[10] tenant lookup for the signed-in user');
{
  const admin = (data: unknown, error: unknown = null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) });
  const ok = await lookupTenant(admin({ tenant_id: TENANT_A }), 'u1');
  check('profile with a company → ok', ok.ok && ok.tenantId === TENANT_A);
  const none = await lookupTenant(admin({ tenant_id: null }), 'u1');
  check('profile without a company → 403 no_workspace', !none.ok && none.status === 403 && none.code === 'no_workspace');
  const noProfile = await lookupTenant(admin(null), 'u1');
  check('no profile → 403', !noProfile.ok && noProfile.status === 403);
  const err = await lookupTenant(admin(null, { message: 'db down' }), 'u1');
  check('database error → 503 (fails closed)', !err.ok && err.status === 503 && err.code === 'workspace_unavailable');
  const junk = await lookupTenant(admin({ tenant_id: 'not-a-uuid' }), 'u1');
  check('garbage tenant value → refused', !junk.ok);
  check('isUuid accepts real ids only', isUuid(TENANT_A) && !isUuid('') && !isUuid('*') && !isUuid(null));
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
