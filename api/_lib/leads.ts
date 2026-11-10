import { validateEmail, validateName, validatePhone } from './validators.js';
import { isUuid } from './tenant.js';

export const LEAD_COLUMNS =
  'id,tenant_id,name,phone,email,zip_code,roofing_need,consent,consent_text,' +
  'conversation,lead_score,status,source,user_agent,created_at';

const LIST_LIMIT = 200;
const MAX_CONVERSATION_TURNS = 40;
const MAX_CONVERSATION_TEXT = 1000;
const WIDGET_KEY_RE = /^wk_[a-f0-9]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CleanLead {
  name: string;
  phone: string | null;
  email: string | null;
  zip_code: string;
  roofing_need: string;
  consent: true;
  consent_text: string;
  conversation: Array<{ sender: string; text: string; timestamp: string }>;
}

type ParseResult = { ok: true; lead: CleanLead; widgetKey: string } | { ok: false; field: string; message: string };

const clean = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

export function parseWidgetLead(value: unknown): ParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, field: 'body', message: 'Send a valid lead request.' };
  }
  const input = value as Record<string, unknown>;
  if (clean(input.company_website, 100)) return { ok: false, field: 'company_website', message: 'Submission rejected.' };
  const widgetKey = typeof input.widget_key === 'string' ? input.widget_key.trim() : '';
  if (!WIDGET_KEY_RE.test(widgetKey)) return { ok: false, field: 'widget_key', message: 'This widget is not configured correctly.' };

  const name = validateName(input.name);
  if (name.ok === false) return { ok: false, field: 'name', message: name.error };

  const phoneRaw = clean(input.phone, 32);
  const emailRaw = clean(input.email, 254);
  const phone = phoneRaw ? validatePhone(phoneRaw) : null;
  const email = emailRaw ? validateEmail(emailRaw) : null;
  if (!phoneRaw && !emailRaw) return { ok: false, field: 'contact', message: 'Please give us a phone number or email address.' };
  if (phone && phone.ok === false) return { ok: false, field: 'phone', message: phone.error };
  if (email && email.ok === false) return { ok: false, field: 'email', message: email.error };

  const zip = clean(input.zip_code, 10) || 'N/A';
  if (zip !== 'N/A' && !/^\d{5}$/.test(zip)) return { ok: false, field: 'zip_code', message: 'Enter a 5-digit ZIP code, or N/A.' };
  const roofingNeed = clean(input.roofing_need, 500);
  if (roofingNeed.length < 3) return { ok: false, field: 'roofing_need', message: 'Tell us briefly what is happening with your roof.' };
  if (input.consent !== true) return { ok: false, field: 'consent', message: 'Consent is required before we can save this request.' };

  const rawTurns = Array.isArray(input.conversation) ? input.conversation.slice(0, MAX_CONVERSATION_TURNS) : [];
  const conversation = rawTurns.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const turn = entry as Record<string, unknown>;
    const text = clean(turn.text, MAX_CONVERSATION_TEXT);
    if (!text) return [];
    return [{
      sender: clean(turn.sender, 16) || 'unknown',
      text,
      timestamp: clean(turn.timestamp, 40) || new Date().toISOString(),
    }];
  });

  return {
    ok: true,
    widgetKey,
    lead: {
      name: name.value,
      phone: phone?.ok === true ? phoneRaw : null,
      email: email?.ok === true ? email.value : null,
      zip_code: zip,
      roofing_need: roofingNeed,
      consent: true,
      consent_text: clean(input.consent_text, 500) || 'Consent checkbox ticked (text not supplied).',
      conversation,
    },
  };
}

export function scoreLead(lead: CleanLead): number {
  let score = lead.phone && lead.email ? 35 : lead.phone ? 25 : 20;
  if (/^\d{5}$/.test(lead.zip_code)) score += 15;
  const text = [lead.roofing_need, ...lead.conversation.map((turn) => turn.text)].join(' ').toLowerCase();
  const urgency = ['leak', 'water', 'storm', 'hail', 'missing shingles', 'emergency', 'tarp', 'sagging', 'mold']
    .filter((word) => text.includes(word)).length;
  score += Math.min(25, urgency * 5);
  score += Math.min(15, lead.conversation.length * 3);
  if (lead.consent) score += 10;
  return Math.min(100, score);
}

export interface LeadStore {
  resolveWidgetKey(key: string): Promise<string | null>;
  resolveUserTenant(userId: string): Promise<string | null>;
  resolveWidgetKeyForTenant(tenantId: string): Promise<string | null>;
  list(tenantId: string, limit: number): Promise<Array<Record<string, unknown>>>;
  insert(tenantId: string, lead: CleanLead, userAgent: string | null, score: number): Promise<{ id: string; lead_score: number | null }>;
}

export interface LeadsApiDependencies {
  configured: boolean;
  authenticate(accessToken: string): Promise<{ id: string } | null>;
  store: LeadStore;
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
const PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (origin === 'null') return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function handleLeadsRequest(request: Request, deps: LeadsApiDependencies): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: PUBLIC_HEADERS });

  if (request.method === 'POST') {
    let body: unknown;
    try { body = await request.json(); }
    catch { return json({ ok: false, error: 'bad_json' }, 400, PUBLIC_HEADERS); }
    const parsed = parseWidgetLead(body);
    if (parsed.ok === false) return json({ ok: false, error: 'validation', field: parsed.field, message: parsed.message }, 400, PUBLIC_HEADERS);
    if (!deps.configured) return json({ ok: false, error: 'database_not_configured' }, 503, PUBLIC_HEADERS);
    try {
      const tenantId = await deps.store.resolveWidgetKey(parsed.widgetKey);
      if (!isUuid(tenantId)) return json({ ok: false, error: 'invalid_widget' }, 404, PUBLIC_HEADERS);
      const userAgent = clean(request.headers.get('user-agent'), 300) || null;
      const row = await deps.store.insert(tenantId, parsed.lead, userAgent, scoreLead(parsed.lead));
      return json({ ok: true, id: row.id, score: row.lead_score }, 201, PUBLIC_HEADERS);
    } catch {
      return json({ ok: false, error: 'storage_error', message: 'We could not save that request. Please try again.' }, 503, PUBLIC_HEADERS);
    }
  }

  if (request.method === 'GET') {
    if (!sameOrigin(request)) return json({ ok: false, error: 'forbidden_origin' }, 403);
    if (!deps.configured) return json({ ok: false, error: 'database_not_configured' }, 503);
    const authorization = request.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (!match) return json({ ok: false, error: 'unauthenticated' }, 401);
    try {
      const user = await deps.authenticate(match[1]);
      if (!user) return json({ ok: false, error: 'unauthenticated' }, 401);
      const tenantId = await deps.store.resolveUserTenant(user.id);
      if (!isUuid(tenantId)) return json({ ok: false, error: 'no_workspace' }, 403);
      const rows = await deps.store.list(tenantId, LIST_LIMIT);
      const leads = rows.map((row) => {
        if (row.tenant_id !== tenantId) throw new Error('tenant_mismatch');
        const { tenant_id: _tenantId, ...safeRow } = row;
        void _tenantId;
        return safeRow;
      });
      const widgetKey = await deps.store.resolveWidgetKeyForTenant(tenantId);
      return json({ ok: true, leads, count: leads.length, widget_key: widgetKey ?? null }, 200);
    } catch {
      return json({ ok: false, error: 'storage_error' }, 503);
    }
  }

  return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, OPTIONS' });
  }
