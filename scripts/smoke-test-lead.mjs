#!/usr/bin/env node
/**
 * Smoke test: submit a test lead the same way the website widget does, then
 * confirm the row really exists in Supabase.
 *
 *   node scripts/smoke-test-lead.mjs            submit + verify (the lead is kept)
 *   node scripts/smoke-test-lead.mjs --cleanup  submit + verify + delete the test lead
 *   node scripts/smoke-test-lead.mjs --full     also check that bad requests are rejected
 *
 * Settings (environment variables, or a .env.local / .env file in the project root):
 *   SITE_URL                   your deployed site, e.g. https://your-app.vercel.app
 *   WIDGET_KEY                 the wk_... key shown in your CRM
 *   SUPABASE_URL               (or VITE_SUPABASE_URL) your project URL
 *   SUPABASE_SERVICE_ROLE_KEY  server-side key, used here only to read the row back
 *
 * The test lead uses a phone number only (no email), so no confirmation email is sent.
 * The service role key never leaves your computer: it is only sent to your own Supabase.
 */
import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const CLEANUP = args.has('--cleanup');
const FULL = args.has('--full');

// ---- settings --------------------------------------------------------------
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value && process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch { /* file not present */ }
}
const env = (k) => (process.env[k] ?? '').trim();
const SITE_URL = (env('SITE_URL') || env('APP_BASE_URL')).replace(/\/+$/, '');
const WIDGET_KEY = env('WIDGET_KEY');
const SUPABASE_URL = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

// ---- tiny reporting helpers ------------------------------------------------
let failures = 0;
const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const step = (msg) => console.log(`\n${msg}`);
const die = (msg) => { console.log(`\n${msg}\n`); process.exit(1); };

const missing = [
  !SITE_URL && 'SITE_URL',
  !WIDGET_KEY && 'WIDGET_KEY',
  !SUPABASE_URL && 'SUPABASE_URL',
  !SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);
if (missing.length) die(`Missing settings: ${missing.join(', ')}.\nSet them as environment variables or in .env.local (see the header of this script).`);
if (!/^wk_[a-f0-9]{32}$/.test(WIDGET_KEY)) die('WIDGET_KEY should look like wk_ followed by 32 letters/numbers. Copy it from your CRM.');

const sb = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

const post = async (payload) => {
  const res = await fetch(`${SITE_URL}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

// ---- the test ---------------------------------------------------------------
const stamp = new Date().toISOString();
const testLead = {
  widget_key: WIDGET_KEY,
  name: 'RoofFlow Test Lead',
  phone: '(202) 555-0147',
  zip_code: '10001',
  roofing_need: `Smoke test ${stamp}: leak in the ceiling after a storm`,
  consent: true,
  consent_text: 'Smoke test: consent given for follow-up.',
  conversation: [
    { sender: 'ai', text: "What's going on with your roof?", timestamp: stamp },
    { sender: 'user', text: 'There is a leak in the ceiling.', timestamp: stamp },
  ],
};

console.log(`RoofFlow lead smoke test\n  site:     ${SITE_URL}\n  supabase: ${SUPABASE_URL}`);

step('1. Look up your workspace in Supabase');
let tenantId = null;
{
  const res = await sb(`tenants?widget_key=eq.${encodeURIComponent(WIDGET_KEY)}&select=id`);
  const rows = res.ok ? await res.json().catch(() => []) : [];
  if (!res.ok) fail(`Supabase answered ${res.status}. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  else if (!rows.length) fail('No workspace has this widget key. Copy the key again from your CRM.');
  else { tenantId = rows[0].id; pass(`workspace found (${tenantId})`); }
}
if (!tenantId) die('Stopping: cannot verify anything without the workspace.');

step('2. Submit the test lead through the public widget endpoint');
const sent = await post(testLead);
if (sent.status === 429) die('The site rate-limited this request (5 lead submissions per 10 minutes). Wait a few minutes and run it again.');
check(sent.status === 201 && sent.body.ok === true, `POST /api/leads answered 201 (got ${sent.status}${sent.body.error ? `: ${sent.body.error}` : ''})`);
const leadId = sent.body.id;
check(typeof leadId === 'string' && /^[0-9a-f-]{36}$/i.test(leadId), `response contains a lead id (${leadId ?? 'none'})`);
if (typeof leadId !== 'string') die('Stopping: the site did not return a lead id, so there is nothing to look up.');

step('3. Confirm the row exists in Supabase');
let row = null;
for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
  const res = await sb(`leads?id=eq.${leadId}&select=*`);
  const rows = res.ok ? await res.json().catch(() => []) : [];
  row = rows[0] ?? null;
  if (!row) await new Promise((r) => setTimeout(r, 1000));
}
check(Boolean(row), `leads row ${leadId} found`);
if (row) {
  check(row.tenant_id === tenantId, 'saved under your workspace (tenant_id matches your widget key)');
  check(row.name === testLead.name, `name saved (${row.name})`);
  check(String(row.phone ?? '').replace(/\D/g, '') === '2025550147', 'phone saved');
  check(row.consent === true && Boolean(row.consent_text), 'consent and consent text saved');
  check(row.status === 'New Lead', `status is "New Lead" (got "${row.status}")`);
  check(row.source === 'Website Widget', `source is "Website Widget" (got "${row.source}")`);
  check(Array.isArray(row.conversation) && row.conversation.length === 2, `conversation saved (${Array.isArray(row.conversation) ? row.conversation.length : 0} messages)`);
  check(typeof row.lead_score === 'number', `lead score calculated (${row.lead_score})`);
  check(Boolean(row.created_at), `created_at set (${row.created_at})`);
}

if (FULL) {
  step('4. Check that bad requests are rejected (these should NOT create leads)');
  const noConsent = await post({ ...testLead, consent: false });
  check(noConsent.status === 400, `missing consent is rejected with 400 (got ${noConsent.status})`);
  const badKey = await post({ ...testLead, widget_key: `wk_${'0'.repeat(32)}` });
  check(badKey.status === 404, `unknown widget key is rejected with 404 (got ${badKey.status})`);
}

if (CLEANUP) {
  step(`${FULL ? '5' : '4'}. Delete the test lead`);
  const del = await sb(`leads?id=eq.${leadId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  check(del.ok, `delete request accepted (${del.status})`);
  const again = await sb(`leads?id=eq.${leadId}&select=id`);
  const rows = again.ok ? await again.json().catch(() => [1]) : [1];
  check(rows.length === 0, 'test lead is gone');
} else {
  console.log(`\nThe test lead was kept so you can see it: Supabase dashboard -> Table Editor -> leads (id ${leadId}),\nand in your CRM as "RoofFlow Test Lead". Run with --cleanup to delete it automatically.`);
}

console.log(failures ? `\n${failures} check(s) FAILED.\n` : '\nAll checks passed: a lead submitted through the widget endpoint is stored in Supabase.\n');
process.exit(failures ? 1 : 0);
