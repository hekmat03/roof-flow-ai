#!/usr/bin/env node
/**
 * Auth smoke test for a deployed RoofFlow: signup, login, logout and protected data.
 *
 *   node scripts/smoke-test-auth.mjs            run every check, then delete the test users
 *   node scripts/smoke-test-auth.mjs --keep     leave the test users and their data in place
 *
 * Settings (environment variables, or a .env.local / .env file in the project root):
 *   SITE_URL                   your deployed site, e.g. https://your-app.vercel.app
 *   SUPABASE_URL               (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY          (or VITE_SUPABASE_ANON_KEY) the public key the browser uses
 *   SUPABASE_SERVICE_ROLE_KEY  server-side key: creates/confirms/deletes the TEST users only
 *   TEST_EMAIL                 optional, a mailbox you own (you@gmail.com). Enables the REAL
 *                              signup check: one confirmation email goes to
 *                              you+rf-smoke-<time>@gmail.com. Leave it out and signup is skipped.
 *
 * It creates two throwaway users, checks that each can only see their own data, and removes
 * everything it created. The service role key never leaves your computer.
 */
import { readFileSync } from 'node:fs';

const KEEP = process.argv.includes('--keep');

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
const SITE = env('SITE_URL').replace(/\/+$/, '');
const SB = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
const ANON = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const TEST_EMAIL = env('TEST_EMAIL');

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { failures += 1; console.log(`  FAIL  ${m}`); };
const note = (m) => console.log(`  NOTE  ${m}`);
const check = (ok, m) => (ok ? pass(m) : fail(m));
const step = (m) => console.log(`\n${m}`);
const die = (m) => { console.log(`\n${m}\n`); process.exit(1); };

const missing = [!SITE && 'SITE_URL', !SB && 'SUPABASE_URL', !ANON && 'SUPABASE_ANON_KEY', !SERVICE && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
if (missing.length) die(`Missing settings: ${missing.join(', ')}.\nSet them as environment variables or in .env.local (see the header of this script).`);

const json = async (res) => { try { return await res.json(); } catch { return {}; } };
const auth = (path, init = {}, key = ANON, bearer = key) =>
  fetch(`${SB}/auth/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
const rest = (path, { token, key = ANON, ...init } = {}) =>
  fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
const api = (path, { token, ...init } = {}) =>
  fetch(`${SITE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });

const stamp = Date.now().toString(36);
const PASSWORD = `Rf-${stamp}-Test9!`;
const created = []; // { id, email, tenantId }
const adminCreate = async (email) => {
  const res = await auth('admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) }, SERVICE);
  const body = await json(res);
  if (!res.ok || !body.id) die(`Could not create a test user (${res.status}): ${body.msg || body.message || body.error_description || 'unknown error'}. Check SUPABASE_SERVICE_ROLE_KEY.`);
  created.push({ id: body.id, email });
  return body.id;
};
const signIn = async (email, password = PASSWORD) => {
  const res = await auth('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  return { status: res.status, body: await json(res) };
};

console.log(`RoofFlow auth smoke test\n  site:     ${SITE}\n  supabase: ${SB}`);

// ---------------------------------------------------------------------------
step('1. The app pages load (deep links work, so /app and /login can be opened directly)');
for (const path of ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/app']) {
  const res = await fetch(`${SITE}${path}`).catch(() => null);
  const text = res ? await res.text() : '';
  check(res?.status === 200 && /<div id="root"/.test(text), `${path} serves the app (${res?.status ?? 'no response'})`);
}

// ---------------------------------------------------------------------------
step('2. Signup');
const weak = await auth('signup', { method: 'POST', body: JSON.stringify({ email: `rf-smoke-weak-${stamp}@example.com`, password: 'abc' }) });
check(weak.status >= 400 && weak.status < 500, `a 3-character password is rejected (${weak.status})`);

let emailA = `rf-smoke-a-${stamp}@example.com`;
let idA;
if (TEST_EMAIL && /^[^@+\s]+@[^@\s]+$/.test(TEST_EMAIL)) {
  const [local, domain] = TEST_EMAIL.split('@');
  emailA = `${local}+rf-smoke-${stamp}@${domain}`;
  const res = await auth('signup', { method: 'POST', body: JSON.stringify({ email: emailA, password: PASSWORD }) });
  const body = await json(res);
  if (res.status === 429 || body.error_code === 'over_email_send_rate_limit') {
    note('Supabase limited the confirmation email (its default sender allows only a few per hour). Wait and re-run, or add your own SMTP in Supabase.');
    idA = await adminCreate(emailA);
  } else {
    idA = body.user?.id ?? body.id;
    check(res.ok && Boolean(idA), `signup created the account (${res.status})`);
    if (idA) created.push({ id: idA, email: emailA });
    const gotSession = Boolean(body.access_token || body.session?.access_token);
    if (gotSession) note('Email confirmation is OFF in Supabase, so a new account gets a session before verifying. Turn on Authentication -> Providers -> Email -> Confirm email.');
    else {
      pass('no session is issued until the email is verified');
      const early = await signIn(emailA);
      check(early.status === 400 && /confirm/i.test(`${early.body.error_code} ${early.body.msg} ${early.body.error_description}`), `login is refused before the email is confirmed (${early.status} ${early.body.error_code ?? ''})`);
      await auth(`admin/users/${idA}`, { method: 'PUT', body: JSON.stringify({ email_confirm: true }) }, SERVICE);
      note(`a real confirmation email was sent to ${emailA}; the script confirmed the address itself`);
    }
  }
} else {
  note('TEST_EMAIL not set: the real signup + confirmation-email check is skipped (the users below are created through the admin API).');
  idA = await adminCreate(emailA);
}
const emailB = `rf-smoke-b-${stamp}@example.com`;
await adminCreate(emailB);

// ---------------------------------------------------------------------------
step('3. Login');
const bad = await signIn(emailA, `${PASSWORD}-wrong`);
check(bad.status === 400 && !bad.body.access_token, `a wrong password is rejected (${bad.status})`);
const nobody = await signIn(`nobody-${stamp}@example.com`);
check(nobody.status === 400 && !nobody.body.access_token, `an unknown email is rejected (${nobody.status})`);
const a = await signIn(emailA);
const b = await signIn(emailB);
check(Boolean(a.body.access_token), 'user A can log in');
check(Boolean(b.body.access_token), 'user B can log in');
if (!a.body.access_token || !b.body.access_token) die('Stopping: cannot continue without two logged-in users.');
const tokenA = a.body.access_token, tokenB = b.body.access_token;
const userA = a.body.user?.id, userB = b.body.user?.id;
check(Boolean(a.body.user?.email_confirmed_at), 'user A is a verified user');

step('4. A new account gets its own workspace automatically');
const profA = await json(await rest('profiles?select=user_id,tenant_id', { token: tokenA }));
const profB = await json(await rest('profiles?select=user_id,tenant_id', { token: tokenB }));
check(Array.isArray(profA) && profA.length === 1 && profA[0].user_id === userA, 'A can read exactly their own profile');
check(Array.isArray(profB) && profB.length === 1 && profB[0].user_id === userB, 'B can read exactly their own profile');
const tenantA = profA[0]?.tenant_id, tenantB = profB[0]?.tenant_id;
check(Boolean(tenantA) && Boolean(tenantB) && tenantA !== tenantB, 'A and B have different workspaces');
for (const c of created) c.tenantId = c.id === userA ? tenantA : c.id === userB ? tenantB : undefined;

// ---------------------------------------------------------------------------
step('5. Protected pages and data: signed out');
const anonLeads = await rest('leads?select=id');
const anonRows = anonLeads.ok ? await json(anonLeads) : [];
check(!(Array.isArray(anonRows) && anonRows.length > 0), `the leads table returns nothing without a login (${anonLeads.status})`);
const anonBilling = await json(await api('/api/billing/status'));
check(anonBilling.authenticated === false, 'the server sees a visitor with no token as signed out');
const anonFollow = await api('/api/followups', { method: 'POST', body: '{}' });
check(anonFollow.status === 401, `a protected API refuses requests with no token (${anonFollow.status})`);
const fakeBilling = await json(await api('/api/billing/status', { token: 'not-a-real-token' }));
check(fakeBilling.authenticated === false, 'a made-up token is not accepted');

step('6. Protected pages and data: signed in');
const billA = await json(await api('/api/billing/status', { token: tokenA }));
check(billA.authenticated === true, 'the server recognises user A\'s token');
const teamMe = await api('/api/team/me', { token: tokenA });
if (teamMe.status === 503) note('/api/team/me says user management is not set up (run supabase/014_user_management.sql).');
else check(teamMe.status === 200 && (await json(teamMe)).role === 'owner', `a new user is the owner of their workspace (${teamMe.status})`);
const teamAnon = await api('/api/team/me');
check(teamAnon.status === 401 || teamAnon.status === 503, `/api/team/me refuses requests with no token (${teamAnon.status})`);

step('7. Each user sees only their own CRM data');
const tenantRow = await json(await rest('tenants?select=id,widget_key', { token: tokenA }));
const key = Array.isArray(tenantRow) ? tenantRow[0]?.widget_key : null;
if (!key) {
  note('Could not read A\'s widget key, so the cross-account lead checks are skipped.');
} else {
  const stampIso = new Date().toISOString();
  const post = await api('/api/leads', { method: 'POST', body: JSON.stringify({
    widget_key: key, name: 'RoofFlow Auth Test', phone: '(202) 555-0147', zip_code: '10001', roofing_need: `Auth smoke test ${stampIso}`,
    consent: true, consent_text: 'Auth smoke test consent.',
    conversation: [{ sender: 'ai', text: 'Hi', timestamp: stampIso }, { sender: 'user', text: 'Leak', timestamp: stampIso }],
  }) });
  const lead = await json(post);
  if (post.status === 429) note('The lead endpoint is rate-limited (5 per 10 minutes). Wait and re-run for the lead isolation checks.');
  else {
    check(post.status === 201 && Boolean(lead.id), `a lead was submitted into A's workspace (${post.status})`);
    if (lead.id) {
      const seenA = await json(await rest(`leads?id=eq.${lead.id}&select=id,tenant_id`, { token: tokenA }));
      check(Array.isArray(seenA) && seenA.length === 1, 'A can see their own lead');
      const seenB = await json(await rest(`leads?id=eq.${lead.id}&select=id`, { token: tokenB }));
      check(Array.isArray(seenB) && seenB.length === 0, 'B can NOT see A\'s lead');
      const listB = await json(await rest('leads?select=id', { token: tokenB }));
      check(Array.isArray(listB) && !listB.some((r) => r.id === lead.id), 'A\'s lead is not in B\'s lead list');
      const editB = await rest(`leads?id=eq.${lead.id}`, { token: tokenB, method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'Closed-Lost' }) });
      const edited = editB.ok ? await json(editB) : [];
      check(!(Array.isArray(edited) && edited.length > 0), 'B can NOT edit A\'s lead');
      const delB = await rest(`leads?id=eq.${lead.id}`, { token: tokenB, method: 'DELETE', headers: { Prefer: 'return=representation' } });
      const deleted = delB.ok ? await json(delB) : [];
      check(!(Array.isArray(deleted) && deleted.length > 0), 'B can NOT delete A\'s lead');
      const still = await json(await rest(`leads?id=eq.${lead.id}&select=id,status`, { token: tokenA }));
      check(Array.isArray(still) && still.length === 1 && still[0].status === 'New Lead', 'A\'s lead is unchanged after B\'s attempts');
    }
  }
  const tenantSeenByB = await json(await rest(`tenants?id=eq.${tenantA}&select=id`, { token: tokenB }));
  check(Array.isArray(tenantSeenByB) && tenantSeenByB.length === 0, 'B can NOT read A\'s workspace (widget key stays private)');
  const profSeenByB = await json(await rest(`profiles?user_id=eq.${userA}&select=user_id`, { token: tokenB }));
  check(Array.isArray(profSeenByB) && profSeenByB.length === 0, 'B can NOT read A\'s profile');
  const flipB = await rest(`profiles?user_id=eq.${userB}`, { token: tokenB, method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ tenant_id: tenantA }) });
  const flipped = flipB.ok ? await json(flipB) : [];
  check(!(Array.isArray(flipped) && flipped.length > 0), 'B can NOT move themselves into A\'s workspace');
}

// ---------------------------------------------------------------------------
step('8. Logout');
const out = await auth('logout', { method: 'POST' }, ANON, tokenA);
check(out.status === 204 || out.ok, `logout succeeded (${out.status})`);
const afterBilling = await json(await api('/api/billing/status', { token: tokenA }));
check(afterBilling.authenticated === false, 'the server no longer accepts the old token after logout');
const afterRefresh = await auth('token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: a.body.refresh_token }) });
check(afterRefresh.status >= 400, `the old refresh token cannot get a new session (${afterRefresh.status})`);
note('Supabase tokens are signed and stay valid for direct database reads until they expire (about an hour), even after logout. The app\'s own API checks the live session, as shown above.');
const stillB = await json(await api('/api/billing/status', { token: tokenB }));
check(stillB.authenticated === true, 'logging A out did not log B out');

// ---------------------------------------------------------------------------
if (KEEP) {
  step('9. Cleanup skipped (--keep)');
  for (const c of created) console.log(`  kept  ${c.email} (${c.id})`);
} else {
  step('9. Clean up the test users and their data');
  for (const c of created) {
    if (c.tenantId) await rest(`leads?tenant_id=eq.${c.tenantId}`, { key: SERVICE, method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    const del = await auth(`admin/users/${c.id}`, { method: 'DELETE' }, SERVICE);
    if (c.tenantId) await rest(`tenants?id=eq.${c.tenantId}`, { key: SERVICE, method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    check(del.ok, `removed ${c.email}`);
  }
}

console.log(`
Browser check (about 2 minutes, because page redirects run in the browser):
  1. Open ${SITE}/app in a private window while signed out  -> you should land on /login.
  2. Sign up, open the email link, then Log in               -> you should reach the dashboard, and the CRM tab should open.
  3. Log out, then press the browser Back button             -> the CRM must not show your leads again.
  4. Open ${SITE}/login while signed in                      -> you should be sent to /app.`);
console.log(failures ? `\n${failures} check(s) FAILED.\n` : '\nAll automatic checks passed.\n');
process.exit(failures ? 1 : 0);
