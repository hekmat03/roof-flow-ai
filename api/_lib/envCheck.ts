// api/_lib/envCheck.ts — which environment variables this app needs, and whether the
// values look right. Pure functions: no network, no secrets returned (names + verdicts only).
// scripts/verify-env.mjs carries the same catalog for the local check; a test keeps them in step.

export type EnvLevel = 'required' | 'recommended' | 'optional';
export type EnvStatus = 'ok' | 'missing' | 'invalid' | 'placeholder';

export interface EnvSpec {
  name: string;
  level: EnvLevel;
  /** Settings in a group that need each other (all-or-none) share a group name. */
  group: string;
  purpose: string;
  validate?: (value: string) => string | null;
}

export interface EnvResult {
  name: string;
  level: EnvLevel;
  group: string;
  purpose: string;
  status: EnvStatus;
  message: string;
}

export const PLACEHOLDER = /(YOUR[-_ ]|yourdomain|example\.com|changeme|xxxx|<[^>]*>)/i;

const claims = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
};
const expired = (c: Record<string, unknown> | null) => typeof c?.exp === 'number' && c.exp * 1000 < Date.now();

const httpsOrigin = (v: string): string | null => {
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') return 'must start with https://';
    if (u.pathname !== '/' || u.search || u.hash) return 'must be just the address, with nothing after the domain';
    if (v.endsWith('/')) return 'remove the trailing /';
    return null;
  } catch { return 'is not a valid web address'; }
};
const httpsUrl = (v: string): string | null => { try { return new URL(v).protocol === 'https:' ? null : 'must start with https://'; } catch { return 'is not a valid web address'; } };
const minLength = (n: number) => (v: string) => (v.length >= n ? null : `is too short (use at least ${n} random characters)`);

const serviceKey = (v: string): string | null => {
  if (v.startsWith('sb_secret_')) return null;
  const c = claims(v);
  if (!c) return 'does not look like a Supabase key';
  if (c.role === 'anon') return 'is the ANON key. Use the service_role key here';
  if (c.role !== 'service_role') return 'is not a service_role key';
  return expired(c) ? 'has expired' : null;
};
const anonKey = (v: string): string | null => {
  if (v.startsWith('sb_secret_')) return 'is a SECRET key and would be published in your website code. Use the anon / publishable key';
  if (v.startsWith('sb_publishable_')) return null;
  const c = claims(v);
  if (!c) return 'does not look like a Supabase key';
  if (c.role === 'service_role') return 'is the SERVICE ROLE key and would be published in your website code. Use the anon key';
  if (c.role !== 'anon') return 'is not an anon key';
  return expired(c) ? 'has expired' : null;
};

export const ENV_CATALOG: EnvSpec[] = [
  { name: 'SUPABASE_URL', level: 'required', group: 'database', purpose: 'Server connection to your database', validate: httpsOrigin },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', level: 'required', group: 'database', purpose: 'Server-only database key (never put it in a VITE_ variable)', validate: serviceKey },
  { name: 'VITE_SUPABASE_URL', level: 'required', group: 'database', purpose: 'Database address used by the website (build time)', validate: httpsOrigin },
  { name: 'VITE_SUPABASE_ANON_KEY', level: 'required', group: 'database', purpose: 'Public database key used by the website (build time)', validate: anonKey },
  { name: 'SESSION_SECRET', level: 'required', group: 'security', purpose: 'Signs visitor sessions and links', validate: minLength(32) },
  { name: 'APP_BASE_URL', level: 'required', group: 'security', purpose: 'Your public website address, used in emails and links', validate: httpsOrigin },
  { name: 'XAI_API_KEY', level: 'recommended', group: 'ai', purpose: 'Live AI replies (without it the built-in answers are used)', validate: (v) => (v.startsWith('xai-') ? null : 'should start with xai-') },
  { name: 'AI_MODEL', level: 'optional', group: 'ai-model', purpose: 'Overrides the default Grok model' },
  { name: 'CRON_SECRET', level: 'recommended', group: 'cron', purpose: 'Lets the daily follow-up job run', validate: minLength(16) },
  { name: 'EMAIL_PROVIDER_API_KEY', level: 'optional', group: 'email', purpose: 'Sends follow-up emails (Resend)', validate: (v) => (v.startsWith('re_') ? null : 'should start with re_') },
  { name: 'EMAIL_FROM', level: 'optional', group: 'email', purpose: 'Sender address for follow-up emails', validate: (v) => (/<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?/.test(v) ? null : 'must contain an email address') },
  { name: 'LS_WEBHOOK_SECRET', level: 'optional', group: 'payments', purpose: 'Lemon Squeezy webhook signature', validate: minLength(8) },
  { name: 'LS_VARIANT_STARTER', level: 'optional', group: 'payments', purpose: 'Lemon Squeezy Starter variant id', validate: (v) => (/^\d+$/.test(v) ? null : 'must be a number') },
  { name: 'LS_VARIANT_PRO', level: 'optional', group: 'payments', purpose: 'Lemon Squeezy Pro variant id', validate: (v) => (/^\d+$/.test(v) ? null : 'must be a number') },
  { name: 'LS_CHECKOUT_URL_STARTER', level: 'optional', group: 'payments', purpose: 'Starter checkout link', validate: httpsUrl },
  { name: 'LS_CHECKOUT_URL_PRO', level: 'optional', group: 'payments', purpose: 'Pro checkout link', validate: httpsUrl },
  { name: 'GOOGLE_CLIENT_ID', level: 'optional', group: 'calendar', purpose: 'Google Calendar connection', validate: (v) => (v.endsWith('.apps.googleusercontent.com') ? null : 'should end with .apps.googleusercontent.com') },
  { name: 'GOOGLE_CLIENT_SECRET', level: 'optional', group: 'calendar', purpose: 'Google Calendar connection' },
  { name: 'GOOGLE_REDIRECT_URI', level: 'optional', group: 'calendar', purpose: 'Where Google sends people back', validate: (v) => httpsUrl(v) ?? (v.endsWith('/api/google/callback') ? null : 'should end with /api/google/callback') },
  { name: 'GOOGLE_TOKEN_ENCRYPTION_KEY', level: 'optional', group: 'calendar', purpose: 'Encrypts stored Google tokens', validate: minLength(32) },
  { name: 'ADMIN_EMAILS', level: 'optional', group: 'admin', purpose: 'Who sees the platform Admin panel', validate: (v) => (v.split(',').every((e) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e.trim())) ? null : 'must be email addresses separated by commas') },
  { name: 'VITE_ENABLE_GOOGLE_LOGIN', level: 'optional', group: 'google-login', purpose: 'Shows the Continue with Google button', validate: (v) => (v === 'true' || v === 'false' ? null : 'must be true or false') },
];

/** Groups whose settings only work together. */
const ALL_OR_NONE = new Set(['payments', 'calendar', 'email']);

export interface EnvReport {
  results: EnvResult[];
  requiredOk: boolean;
  /** Plain-language problems: every required failure, plus half-configured groups. */
  problems: string[];
}

export function evaluateEnv(env: Record<string, string | undefined>): EnvReport {
  const value = (name: string) => (env[name] ?? '').trim();
  const results: EnvResult[] = ENV_CATALOG.map((spec) => {
    const v = value(spec.name);
    const base = { name: spec.name, level: spec.level, group: spec.group, purpose: spec.purpose };
    if (!v) return { ...base, status: 'missing' as const, message: 'not set' };
    if (PLACEHOLDER.test(v)) return { ...base, status: 'placeholder' as const, message: 'still has an example value; replace it with your real one' };
    const problem = spec.validate?.(v) ?? null;
    return problem ? { ...base, status: 'invalid' as const, message: problem } : { ...base, status: 'ok' as const, message: 'looks right' };
  });
  const find = (name: string) => results.find((r) => r.name === name)!;
  const markInvalid = (name: string, message: string) => { const r = find(name); if (r.status === 'ok') { r.status = 'invalid'; r.message = message; } };

  // The browser and the server must talk to the same database, and the keys must belong to it.
  const serverUrl = value('SUPABASE_URL').replace(/\/+$/, '');
  const browserUrl = value('VITE_SUPABASE_URL').replace(/\/+$/, '');
  if (serverUrl && browserUrl && serverUrl !== browserUrl) markInvalid('VITE_SUPABASE_URL', 'is a different project than SUPABASE_URL');
  const ref = (() => { try { return new URL(serverUrl).hostname.split('.')[0]; } catch { return ''; } })();
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
    const c = claims(value(name));
    if (ref && c && typeof c.ref === 'string' && c.ref !== ref) markInvalid(name, 'belongs to a different Supabase project than SUPABASE_URL');
  }
  if (value('SUPABASE_SERVICE_ROLE_KEY') && value('SUPABASE_SERVICE_ROLE_KEY') === value('VITE_SUPABASE_ANON_KEY')) {
    markInvalid('VITE_SUPABASE_ANON_KEY', 'is the same as the service role key');
  }

  const problems: string[] = [];
  for (const r of results) {
    if (r.level === 'required' && r.status !== 'ok') problems.push(`${r.name}: ${r.message}`);
    else if (r.level !== 'required' && (r.status === 'invalid' || r.status === 'placeholder')) problems.push(`${r.name}: ${r.message}`);
  }
  for (const group of ALL_OR_NONE) {
    const members = results.filter((r) => r.group === group);
    const some = members.some((r) => r.status !== 'missing');
    const lacking = members.filter((r) => r.status === 'missing');
    if (some && lacking.length) problems.push(`${group} is half set up. Also add: ${lacking.map((r) => r.name).join(', ')}`);
  }
  return { results, requiredOk: results.filter((r) => r.level === 'required').every((r) => r.status === 'ok'), problems };
}
