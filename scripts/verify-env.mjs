#!/usr/bin/env node
/**
 * Checks your Supabase URL, keys and every environment variable RoofFlow needs.
 *
 *   node scripts/verify-env.mjs                        check your .env.local and talk to Supabase
 *   node scripts/verify-env.mjs --offline              only check the values (no network)
 *   node scripts/verify-env.mjs --site https://your-app.vercel.app [--token SECRET]
 *                                                      ALSO check the deployed site (what Vercel really has)
 *
 * Values come from environment variables or a .env.local / .env file in the project root.
 * Nothing is printed except PASS/FAIL lines; secret values are never shown or stored.
 * The keys are only ever sent to your own Supabase project (and the xAI key to xAI).
 */
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const OFFLINE = argv.includes('--offline');
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const SITE = (flag('--site') ?? '').replace(/\/+$/, '');
const TOKEN = flag('--token') ?? '';

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

// name, level, group (keep in step with api/_lib/envCheck.ts: a test compares them)
const CATALOG = [
  ['SUPABASE_URL', 'required', 'database'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'required', 'database'],
  ['VITE_SUPABASE_URL', 'required', 'database'],
  ['VITE_SUPABASE_ANON_KEY', 'required', 'database'],
  ['SESSION_SECRET', 'required', 'security'],
  ['APP_BASE_URL', 'required', 'security'],
  ['XAI_API_KEY', 'recommended', 'ai'],
  ['AI_MODEL', 'optional', 'ai-model'],
  ['AI_PROVIDER', 'optional', 'ai-provider'],
  ['GROQ_API_KEY', 'optional', 'ai-groq'],
  ['CRON_SECRET', 'recommended', 'cron'],
  ['EMAIL_PROVIDER_API_KEY', 'optional', 'email'],
  ['EMAIL_FROM', 'optional', 'email'],
  ['LS_WEBHOOK_SECRET', 'optional', 'payments'],
  ['LS_VARIANT_STARTER', 'optional', 'payments'],
  ['LS_VARIANT_PRO', 'optional', 'payments'],
  ['LS_CHECKOUT_URL_STARTER', 'optional', 'payments'],
  ['LS_CHECKOUT_URL_PRO', 'optional', 'payments'],
  ['GOOGLE_CLIENT_ID', 'optional', 'calendar'],
  ['GOOGLE_CLIENT_SECRET', 'optional', 'calendar'],
  ['GOOGLE_REDIRECT_URI', 'optional', 'calendar'],
  ['GOOGLE_TOKEN_ENCRYPTION_KEY', 'optional', 'calendar'],
  ['ADMIN_EMAILS', 'optional', 'admin'],
  ['VITE_ENABLE_GOOGLE_LOGIN', 'optional', 'google-login'],
];
const ALL_OR_NONE = ['payments', 'calendar', 'email'];
const PLACEHOLDER = /(YOUR[-_ ]|yourdomain|example\.com|changeme|xxxx|<[^>]*>)/i;

const claims = (t) => { const p = t.split('.'); if (p.length !== 3) return null; try { return JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8')); } catch { return null; } };
const expired = (c) => typeof c?.exp === 'number' && c.exp * 1000 < Date.now();
const origin = (v) => { try { const u = new URL(v); if (u.protocol !== 'https:') return 'must start with https://'; if (u.pathname !== '/' || u.search || u.hash) return 'must be just the address, nothing after the domain'; if (v.endsWith('/')) return 'remove the trailing /'; return null; } catch { return 'is not a valid web address'; } };
const httpsUrl = (v) => { try { return new URL(v).protocol === 'https:' ? null : 'must start with https://'; } catch { return 'is not a valid web address'; } };
const min = (n) => (v) => (v.length >= n ? null : `is too short (use at least ${n} random characters)`);
const VALIDATE = {
  SUPABASE_URL: origin,
  VITE_SUPABASE_URL: origin,
  SUPABASE_SERVICE_ROLE_KEY: (v) => { if (v.startsWith('sb_secret_')) return null; const c = claims(v); if (!c) return 'does not look like a Supabase key'; if (c.role === 'anon') return 'is the ANON key. Use the service_role key here'; if (c.role !== 'service_role') return 'is not a service_role key'; return expired(c) ? 'has expired' : null; },
  VITE_SUPABASE_ANON_KEY: (v) => { if (v.startsWith('sb_secret_')) return 'is a SECRET key and would be published in your website code. Use the anon / publishable key'; if (v.startsWith('sb_publishable_')) return null; const c = claims(v); if (!c) return 'does not look like a Supabase key'; if (c.role === 'service_role') return 'is the SERVICE ROLE key and would be published in your website code. Use the anon key'; if (c.role !== 'anon') return 'is not an anon key'; return expired(c) ? 'has expired' : null; },
  SESSION_SECRET: min(32),
  APP_BASE_URL: origin,
  XAI_API_KEY: (v) => (v.startsWith('xai-') ? null : 'should start with xai-'),
  AI_PROVIDER: (v) => (v === 'xai' || v === 'groq' ? null : 'must be xai or groq'),
  GROQ_API_KEY: (v) => (v.startsWith('gsk_') ? null : 'should start with gsk_'),
  CRON_SECRET: min(16),
  EMAIL_PROVIDER_API_KEY: (v) => (v.startsWith('re_') ? null : 'should start with re_'),
  EMAIL_FROM: (v) => (/<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?/.test(v) ? null : 'must contain an email address'),
  LS_WEBHOOK_SECRET: min(8),
  LS_VARIANT_STARTER: (v) => (/^\d+$/.test(v) ? null : 'must be a number'),
  LS_VARIANT_PRO: (v) => (/^\d+$/.test(v) ? null : 'must be a number'),
  LS_CHECKOUT_URL_STARTER: httpsUrl,
  LS_CHECKOUT_URL_PRO: httpsUrl,
  GOOGLE_CLIENT_ID: (v) => (v.endsWith('.apps.googleusercontent.com') ? null : 'should end with .apps.googleusercontent.com'),
  GOOGLE_REDIRECT_URI: (v) => httpsUrl(v) ?? (v.endsWith('/api/google/callback') ? null : 'should end with /api/google/callback'),
  GOOGLE_TOKEN_ENCRYPTION_KEY: min(32),
  ADMIN_EMAILS: (v) => (v.split(',').every((e) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e.trim())) ? null : 'must be email addresses separated by commas'),
  VITE_ENABLE_GOOGLE_LOGIN: (v) => (v === 'true' || v === 'false' ? null : 'must be true or false'),
};

let failures = 0, warnings = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { failures += 1; console.log(`  FAIL  ${m}`); };
const warn = (m) => { warnings += 1; console.log(`  WARN  ${m}`); };
const note = (m) => console.log(`  NOTE  ${m}`);
const step = (m) => console.log(`\n${m}`);

// ---------------------------------------------------------------- 1. the values
step('1. Environment variables (from your .env.local or environment)');
const status = {};
for (const [name, level] of CATALOG) {
  const v = env(name);
  let state = 'ok', msg = 'looks right';
  if (!v) { state = 'missing'; msg = 'not set'; }
  else if (PLACEHOLDER.test(v)) { state = 'placeholder'; msg = 'still has an example value; replace it with your real one'; }
  else { const problem = VALIDATE[name]?.(v) ?? null; if (problem) { state = 'invalid'; msg = problem; } }
  status[name] = { state, msg, level };
}
const mark = (name, msg) => { if (status[name].state === 'ok') { status[name].state = 'invalid'; status[name].msg = msg; } };
const sUrl = env('SUPABASE_URL').replace(/\/+$/, ''), bUrl = env('VITE_SUPABASE_URL').replace(/\/+$/, '');
if (sUrl && bUrl && sUrl !== bUrl) mark('VITE_SUPABASE_URL', 'is a different project than SUPABASE_URL');
let ref = ''; try { ref = new URL(sUrl).hostname.split('.')[0]; } catch { /* invalid url is reported above */ }
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY']) { const c = claims(env(name)); if (ref && c && typeof c.ref === 'string' && c.ref !== ref) mark(name, 'belongs to a different Supabase project than SUPABASE_URL'); }
if (env('SUPABASE_SERVICE_ROLE_KEY') && env('SUPABASE_SERVICE_ROLE_KEY') === env('VITE_SUPABASE_ANON_KEY')) mark('VITE_SUPABASE_ANON_KEY', 'is the same as the service role key');

for (const [name, level] of CATALOG) {
  const { state, msg } = status[name];
  if (state === 'ok') pass(`${name} ${msg}`);
  else if (level === 'required') fail(`${name}: ${msg}`);
  else if (state === 'missing') note(`${name} not set (${level === 'recommended' ? 'recommended' : 'optional'})`);
  else warn(`${name}: ${msg}`);
}
for (const group of ALL_OR_NONE) {
  const members = CATALOG.filter((c) => c[2] === group).map((c) => c[0]);
  const lacking = members.filter((n) => status[n].state === 'missing');
  if (members.some((n) => status[n].state !== 'missing') && lacking.length) warn(`${group} is half set up. Also add: ${lacking.join(', ')}`);
}
if (status.XAI_API_KEY.state === 'missing') note('Without XAI_API_KEY the chatbots still answer, using the built-in replies.');

// ---------------------------------------------------------------- 2. live Supabase
const SB = sUrl, ANON = env('VITE_SUPABASE_ANON_KEY'), SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const canTalk = !OFFLINE && status.SUPABASE_URL.state === 'ok' && status.VITE_SUPABASE_ANON_KEY.state !== 'missing' && status.SUPABASE_SERVICE_ROLE_KEY.state !== 'missing';
const sb = (path, key, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
const body = async (res) => { try { return await res.json(); } catch { return null; } };

step('2. Supabase (live)');
if (OFFLINE) note('Skipped (--offline).');
else if (!canTalk) note('Skipped: fix the SUPABASE values above first.');
else {
  try {
    const health = await sb('/auth/v1/health', ANON);
    if (health.ok) pass('the Supabase URL is reachable'); else fail(`the Supabase URL answered ${health.status}. Check SUPABASE_URL and that the project is not paused.`);
    const anon = await sb('/rest/v1/', ANON);
    if (anon.ok) pass('the anon key is accepted'); else fail(`the anon key was rejected (${anon.status}). Copy it again from Supabase -> Project Settings -> API.`);
    const svc = await sb('/auth/v1/admin/users?per_page=1', SERVICE);
    if (svc.ok) pass('the service role key is accepted'); else fail(`the service role key was rejected (${svc.status}). Copy it again from Supabase -> Project Settings -> API.`);
    if (svc.ok) {
      const tables = ['tenants', 'profiles', 'leads', 'contractor_profiles', 'scheduled_messages', 'messages', 'calendar_connections', 'email_suppressions', 'contact_optouts', 'usage_conversations'];
      const absent = [];
      for (const t of tables) { const r = await sb(`/rest/v1/${t}?select=*&limit=0`, SERVICE); if (!r.ok) absent.push(t); }
      if (absent.length) fail(`tables missing: ${absent.join(', ')}. Run the SQL files in the supabase/ folder, in number order (001 to 014).`);
      else pass(`all ${tables.length} core tables exist`);
      const inv = await sb('/rest/v1/team_invites?select=id&limit=0', SERVICE);
      if (inv.ok) pass('team_invites exists (migration 014 is applied)'); else warn('team_invites is missing: run supabase/014_user_management.sql to enable team management.');
      const cols = await sb('/rest/v1/profiles?select=role,full_name,disabled&limit=0', SERVICE);
      if (cols.ok) pass('profiles has role, full_name and disabled'); else warn('profiles is missing the user-management columns: run supabase/014_user_management.sql.');
      const rows = await sb('/rest/v1/leads?select=id&limit=1', ANON);
      const seen = rows.ok ? await body(rows) : [];
      if (Array.isArray(seen) && seen.length > 0) fail('LEADS ARE PUBLIC: the anon key can read lead rows. Row-level security is off on the leads table.');
      else pass('the anon key cannot read leads (row-level security is on)');
    }
  } catch (e) { fail(`could not reach Supabase: ${e instanceof Error ? e.message : e}`); }
}

// ---------------------------------------------------------------- 3. live AI key
step('3. AI key (live)');
if (OFFLINE) note('Skipped (--offline).');
else if (status.XAI_API_KEY.state !== 'ok') note('Skipped: XAI_API_KEY is not set or not valid.');
else {
  try {
    const r = await fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${env('XAI_API_KEY')}` } });
    if (r.ok) pass('xAI accepts the key'); else fail(`xAI rejected the key (${r.status}). Create a new key in the xAI console.`);
  } catch (e) { warn(`could not reach xAI to test the key: ${e instanceof Error ? e.message : e}`); }
}

// ---------------------------------------------------------------- 4. the deployed site
if (SITE) {
  step(`4. Deployed site (${SITE}): what Vercel really has`);
  try {
    const url = `${SITE}/api/team/health${TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ''}`;
    const res = await fetch(url);
    const data = await body(res);
    if (!data) fail(`/api/team/health did not answer with data (${res.status}). The latest version may not be deployed yet.`);
    else {
      if (data.ok) pass('the server reports it is set up (required settings present and database reachable)');
      else fail('the server reports it is NOT fully set up.');
      if (Array.isArray(data.variables)) {
        for (const v of data.variables) {
          if (v.status === 'ok') continue;
          if (v.level === 'required') fail(`on Vercel, ${v.name}: ${v.message}`);
          else if (v.status !== 'missing') warn(`on Vercel, ${v.name}: ${v.message}`);
        }
        if (data.database !== 'ok') fail(`the server cannot use the database (${data.database}).`);
        for (const p of data.problems ?? []) if (/half set up/.test(p)) warn(`on Vercel, ${p}`);
      } else if (!data.ok) note('For the details, set HEALTH_TOKEN (12+ random characters) in Vercel, redeploy, and run this again with --token THAT_VALUE.');
    }
    const ai = await body(await fetch(`${SITE}/api/agent/response`));
    if (ai?.live === true) pass('the server has an AI key (live AI is on)'); else note('the server reports no AI key: the built-in answers are used.');

    const html = await (await fetch(`${SITE}/`)).text();
    const src = /<script[^>]+src="([^"]*assets\/[^"]+\.js)"/.exec(html)?.[1];
    if (!src) warn('could not find the website script to inspect.');
    else {
      const js = await (await fetch(new URL(src, `${SITE}/`))).text();
      if (SB && js.includes(new URL(SB).host)) pass('the published website was built with your Supabase URL');
      else fail('the published website does NOT contain your Supabase URL. Set VITE_SUPABASE_URL in Vercel and redeploy (it is read at build time).');
      if (ANON && js.includes(ANON)) pass('the published website contains your anon key');
      else warn('the published website does not contain your current anon key. Set VITE_SUPABASE_ANON_KEY in Vercel and redeploy.');
      if (SERVICE && js.includes(SERVICE)) fail('DANGER: your SERVICE ROLE key is inside the published website code. Rotate it in Supabase now and remove any VITE_ variable that holds it.');
      else pass('the service role key is not in the published website code');
    }
  } catch (e) { fail(`could not check the site: ${e instanceof Error ? e.message : e}`); }
} else if (!OFFLINE) {
  console.log('\nTip: add  --site https://your-app.vercel.app  to also check what is set on Vercel.');
}

console.log(failures ? `\n${failures} problem(s) to fix${warnings ? `, ${warnings} warning(s)` : ''}.\n` : `\nNo blocking problems${warnings ? `, ${warnings} warning(s) to review` : ''}.\n`);
process.exit(failures ? 1 : 0);
