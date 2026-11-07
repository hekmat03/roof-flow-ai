import { handleLeadsRequest, parseWidgetLead, type LeadStore } from '../api/_lib/leads.ts';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean) => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
};

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const WIDGET_KEY = `wk_${'a'.repeat(32)}`;
const leadInput = {
  name: 'Jordan Rivera',
  phone: '(415) 555-2671',
  email: 'jordan@roofco.com',
  zip_code: '94105',
  roofing_need: 'A leak after the recent storm',
  consent: true,
  consent_text: 'I agree to be contacted.',
  conversation: [{ sender: 'visitor', text: 'There is a leak.', timestamp: '2026-11-06T12:00:00Z' }],
  widget_key: WIDGET_KEY,
};

function mockStore(overrides: Partial<LeadStore> = {}) {
  const calls: { insertTenant?: string; listTenant?: string; inserted?: unknown } = {};
  const store: LeadStore = {
    resolveWidgetKey: async () => TENANT,
    resolveUserTenant: async () => TENANT,
    resolveWidgetKeyForTenant: async () => WIDGET_KEY,
    list: async (tenantId) => {
      calls.listTenant = tenantId;
      return [{ id: 'lead-1', tenant_id: tenantId, name: 'Jordan Rivera' }];
    },
    insert: async (tenantId, lead, _userAgent, score) => {
      calls.insertTenant = tenantId;
      calls.inserted = lead;
      return { id: 'lead-1', lead_score: score };
    },
    ...overrides,
  };
  return { store, calls };
}

const dependencies = (store: LeadStore, configured = true) => ({
  configured,
  authenticate: async (token: string) => token === 'valid-token' ? { id: USER } : null,
  store,
});

const responseJson = async (response: Response) => await response.json() as Record<string, unknown>;

console.log('Lead capture validation');
const valid = parseWidgetLead(leadInput);
check('accepts a complete widget lead', valid.ok && valid.lead.name === 'Jordan Rivera');
check('rejects missing consent', !parseWidgetLead({ ...leadInput, consent: false }).ok);
check('rejects invalid contact details', !parseWidgetLead({ ...leadInput, phone: '555' }).ok);
check('rejects malformed widget key', !parseWidgetLead({ ...leadInput, widget_key: 'tenant-id' }).ok);
check('does not accept a valid ZIP hidden by truncation', !parseWidgetLead({ ...leadInput, zip_code: '94105x' }).ok);
check('bounds transcript length', parseWidgetLead({ ...leadInput, conversation: Array(60).fill({ sender: 'visitor', text: 'ok' }) }).ok &&
  (parseWidgetLead({ ...leadInput, conversation: Array(60).fill({ sender: 'visitor', text: 'ok' }) }) as { lead: { conversation: unknown[] } }).lead.conversation.length === 40);

console.log('\nWidget POST isolation');
const postMock = mockStore();
const postResponse = await handleLeadsRequest(new Request('https://roofco.test/api/leads', {
  method: 'POST', headers: { 'content-type': 'application/json', host: 'roofco.test', 'user-agent': 'widget-test' },
  body: JSON.stringify({ ...leadInput, tenant_id: OTHER_TENANT }),
}), dependencies(postMock.store));
const postBody = await responseJson(postResponse);
check('stores a valid lead', postResponse.status === 201 && postBody.ok === true);
check('resolves tenant from widget key, ignoring body tenant', postMock.calls.insertTenant === TENANT);
check('does not return tenant id to public caller', !('tenant_id' in postBody));
check('allows cross-origin widget POST', postResponse.headers.get('access-control-allow-origin') === '*');
const options = await handleLeadsRequest(new Request('https://roofco.test/api/leads', { method: 'OPTIONS' }), dependencies(postMock.store));
check('supports widget CORS preflight', options.status === 204 && options.headers.get('access-control-allow-methods') === 'POST, OPTIONS');

console.log('\nCRM GET isolation');
const getMock = mockStore();
const getResponse = await handleLeadsRequest(new Request('https://roofco.test/api/leads', {
  headers: { host: 'roofco.test', origin: 'https://roofco.test', authorization: 'Bearer valid-token' },
}), dependencies(getMock.store));
const getBody = await responseJson(getResponse);
const rows = getBody.leads as Array<Record<string, unknown>>;
check('requires and accepts a verified bearer user', getResponse.status === 200 && getBody.ok === true);
check('queries only the authenticated user tenant', getMock.calls.listTenant === TENANT);
check('strips tenant id and returns the widget key', rows?.[0]?.tenant_id === undefined && getBody.widget_key === WIDGET_KEY);
const unauthorized = await handleLeadsRequest(new Request('https://roofco.test/api/leads', { headers: { host: 'roofco.test' } }), dependencies(getMock.store));
check('rejects unauthenticated CRM reads', unauthorized.status === 401);
const foreignOrigin = await handleLeadsRequest(new Request('https://roofco.test/api/leads', {
  headers: { host: 'roofco.test', origin: 'https://attacker.test', authorization: 'Bearer valid-token' },
}), dependencies(getMock.store));
check('rejects cross-origin CRM reads', foreignOrigin.status === 403);
const mismatchedRow = mockStore({ list: async () => [{ id: 'private', tenant_id: OTHER_TENANT }] });
const isolationFailure = await handleLeadsRequest(new Request('https://roofco.test/api/leads', {
  headers: { host: 'roofco.test', authorization: 'Bearer valid-token' },
}), dependencies(mismatchedRow.store));
check('fails closed if storage returns another tenant row', isolationFailure.status === 503);
const offline = await handleLeadsRequest(new Request('https://roofco.test/api/leads', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(leadInput),
}), dependencies(postMock.store, false));
check('reports unavailable storage without credentials', offline.status === 503);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
