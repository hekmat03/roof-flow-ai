// Proves the abuse guards are actually wired into POST /api/leads (not just unit-tested alone).
import { handleLeadsRequest } from '../api/_lib/leads.ts';
import type { Limiter } from '../api/_lib/leadGuards.ts';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { ok ? passed++ : failed++; console.log(`  ${ok ? '✅' : '❌'} ${name}`); };

const T = '11111111-1111-4111-8111-111111111111';
const KEY = 'wk_' + 'a'.repeat(32);
const lead = (over: Record<string, unknown> = {}) => ({
  widget_key: KEY, name: 'Sam Lee', phone: '5551234567', email: 'sam.lee@gmail.com',
  zip_code: '75024', roofing_need: 'hail damage on roof', consent: true, conversation: [], ...over,
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://roof.example/api/leads', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function mk(guards: Record<string, unknown> | undefined) {
  const inserts: number[] = [];
  let after = 0;
  const deps = {
    configured: true, authenticate: async () => null,
    store: {
      resolveWidgetKey: async () => T, resolveUserTenant: async () => null,
      resolveWidgetKeyForTenant: async () => null, list: async () => [],
      insert: async () => { inserts.push(1); return { id: 'lead-' + inserts.length, lead_score: 50 }; },
    },
    afterInsert: async () => { after++; },
    guards,
  } as Parameters<typeof handleLeadsRequest>[1];
  return { deps, inserts, afters: () => after };
}
const okFetch = (success: boolean) => (async () => new Response(JSON.stringify({ success }), { status: 200 })) as typeof fetch;

console.log('[1] oversized body is rejected before anything is saved');
{
  const m = mk({});
  const r = await handleLeadsRequest(post(lead({ roofing_need: 'x'.repeat(40_000) })), m.deps);
  check('413 and nothing inserted', r.status === 413 && m.inserts.length === 0);
}

console.log('[2] Turnstile');
{
  const realFetch = globalThis.fetch;
  try {
    let m = mk({ turnstileSecret: 'secret' });
    let r = await handleLeadsRequest(post(lead()), m.deps);
    check('secret set + no token -> 400, nothing saved', r.status === 400 && m.inserts.length === 0);

    globalThis.fetch = okFetch(false);
    m = mk({ turnstileSecret: 'secret' });
    r = await handleLeadsRequest(post(lead({ turnstile_token: 'bad' })), m.deps);
    check('failed verification -> 400, nothing saved', r.status === 400 && m.inserts.length === 0);

    globalThis.fetch = okFetch(true);
    m = mk({ turnstileSecret: 'secret' });
    r = await handleLeadsRequest(post(lead({ turnstile_token: 'good' })), m.deps);
    check('passed verification -> 201 saved', r.status === 201 && m.inserts.length === 1);

    m = mk({ turnstileSecret: undefined });
    r = await handleLeadsRequest(post(lead()), m.deps);
    check('no secret configured -> check skipped, still saved', r.status === 201 && m.inserts.length === 1);
  } finally { globalThis.fetch = realFetch; }
}

console.log('[3] per-widget-key cap holds across different IPs');
{
  const counts = new Map<string, number>();
  const limiter: Limiter = { async allow(k, limit) { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n <= limit; } };
  const m = mk({ limiter });
  let last = 0, saved = 0;
  for (let i = 0; i < 35; i++) {
    const r = await handleLeadsRequest(post(lead({ email: `p${i}@gmail.com`, phone: `55512${String(30000 + i)}` }), { 'x-forwarded-for': `9.9.9.${i}` }), m.deps);
    last = r.status; if (r.status === 201) saved++;
  }
  check('only 30 saved in the hour, then 429', saved === 30 && last === 429);
}

console.log('[4] duplicates are dropped silently');
{
  const recent = [{ id: 'old-1', email: 'sam.lee@gmail.com', phone: null }];
  const m = mk({ recentLeads: async () => recent });
  const r = await handleLeadsRequest(post(lead()), m.deps);
  const body = await r.json() as { ok?: boolean; id?: string };
  check('same email -> looks like success, but NO insert and NO email', r.status === 201 && body.ok === true && m.inserts.length === 0 && m.afters() === 0);

  const m2 = mk({ recentLeads: async () => recent });
  const r2 = await handleLeadsRequest(post(lead({ email: 'other@gmail.com', phone: '5559998888' })), m2.deps);
  check('different person still saved', r2.status === 201 && m2.inserts.length === 1);

  const m3 = mk({ recentLeads: async () => { throw new Error('db down'); } });
  const r3 = await handleLeadsRequest(post(lead()), m3.deps);
  check('duplicate lookup failing never loses a real lead', r3.status === 201 && m3.inserts.length === 1);
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
