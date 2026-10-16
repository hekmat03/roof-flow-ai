// api/_lib/tools.ts
// Tool-calling for the RoofFlow agents: argument validation, guarded executors
// (Supabase + Resend, both optional) and the bounded agent loop.
// Only TYPE imports from other files, so tests can load this with Node directly.

import type { AgentType } from './agent.js';

export type ToolName = 'book_inspection' | 'send_message' | 'update_crm' | 'schedule_followup';

export const TOOL_SETS: Record<AgentType, ToolName[]> = {
  chatbot: ['book_inspection', 'update_crm'],
  phone: ['book_inspection', 'update_crm'],
  nurturer: ['send_message', 'schedule_followup', 'update_crm'],
  closer: ['send_message', 'schedule_followup', 'update_crm'],
};

export const CRM_STATUSES = ['Contacted', 'In Contact', 'Follow-up Nurture', 'Closed-Lost', 'Do Not Contact'] as const;

export interface ToolResult {
  ok: boolean;
  status: string;
  simulated: boolean;
  persisted: boolean;
  detail?: string;
  id?: string;
  error?: string;
}
export interface ToolAction {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

type Fetch = typeof fetch;

// ---------------------------------------------------------------- Supabase
export interface Supabase {
  insert(table: string, row: Record<string, unknown>): Promise<{ id?: string }>;
  upsert(table: string, row: Record<string, unknown>, onConflict: string): Promise<{ id?: string }>;
  exists(table: string, column: string, value: string): Promise<boolean>;
}

/** Minimal PostgREST client (no dependency). Returns null when not configured. */
export function createSupabase(url?: string, key?: string, fetchFn: Fetch = fetch): Supabase | null {
  if (!url || !key) return null;
  const base = url.replace(/\/+$/, '') + '/rest/v1';
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const send = async (path: string, init: RequestInit) => {
    const r = await fetchFn(base + path, init);
    if (!r.ok) throw new Error(`storage ${r.status}`);
    return r.json();
  };
  return {
    async insert(table, row) {
      const d = await send(`/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return { id: d?.[0]?.id };
    },
    async upsert(table, row, onConflict) {
      const d = await send(`/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      });
      return { id: d?.[0]?.id };
    },
    async exists(table, column, value) {
      const d = await send(`/${table}?${column}=eq.${encodeURIComponent(value)}&select=${column}&limit=1`, {
        method: 'GET',
        headers,
      });
      return Array.isArray(d) && d.length > 0;
    },
  };
}

// ---------------------------------------------------------------- contacts
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{5,}\d/g;

export function normContact(v: string): string {
  const t = v.trim();
  return t.includes('@') ? t.toLowerCase() : t.replace(/\D/g, '');
}

/** Contacts the CUSTOMER actually provided (their own messages + CRM context). */
export function collectAllowedContacts(userTexts: string[], extra: (string | undefined)[] = []): Set<string> {
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normContact(v);
    if (n.includes('@') || (n.length >= 7 && n.length <= 15)) out.add(n);
  };
  for (const t of userTexts) {
    (t.match(EMAIL_RE) || []).forEach(add);
    (t.match(PHONE_RE) || []).forEach(add);
  }
  for (const e of extra) if (e) add(e);
  return out;
}

// -------------------------------------------------------------- validation
type Args = Record<string, unknown>;
type Valid = { ok: true; value: Args } | { ok: false; error: string };

const text = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return t.length >= min && t.length <= max ? t : null;
};
const isPhone = (v: unknown): v is string => typeof v === 'string' && /^\d{7,15}$/.test(normContact(v));
const isEmail = (v: unknown): v is string => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function validateToolArgs(name: string, raw: unknown): Valid {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Args;
  const bad = (error: string): Valid => ({ ok: false, error });
  switch (name) {
    case 'book_inspection': {
      const n = text(a.name, 2, 80), when = text(a.preferred_time, 2, 80);
      const where = text(a.address_or_zip, 3, 120), issue = text(a.issue, 3, 200);
      if (!n) return bad('name is required (2-80 chars)');
      if (!isPhone(a.phone)) return bad('a valid phone number is required');
      if (!when) return bad('preferred_time is required');
      if (!where) return bad('address_or_zip is required');
      if (!issue) return bad('issue is required');
      if (a.email !== undefined && !isEmail(a.email)) return bad('email is invalid');
      return { ok: true, value: { name: n, phone: normContact(a.phone), email: a.email ? String(a.email).trim().toLowerCase() : undefined, preferred_time: when, address_or_zip: where, issue } };
    }
    case 'send_message': {
      const ch = a.channel, body = text(a.body, 5, 600);
      if (ch !== 'email' && ch !== 'sms') return bad('channel must be email or sms');
      if (!body) return bad('body is required (5-600 chars)');
      if (ch === 'email' && !isEmail(a.to)) return bad('a valid email is required');
      if (ch === 'sms' && !isPhone(a.to)) return bad('a valid phone number is required');
      const subject = text(a.subject, 3, 120) || 'Your roof inspection';
      return { ok: true, value: { channel: ch, to: normContact(String(a.to)), subject, body } };
    }
    case 'update_crm': {
      if (!isPhone(a.phone) && !isEmail(a.email)) return bad('phone or email is required to identify the lead');
      const status = a.status;
      if (status !== undefined && !CRM_STATUSES.includes(status as (typeof CRM_STATUSES)[number])) return bad('status not allowed');
      const v: Args = {
        phone: isPhone(a.phone) ? normContact(a.phone) : undefined,
        email: isEmail(a.email) ? a.email.trim().toLowerCase() : undefined,
        name: text(a.name, 2, 80) || undefined,
        zip: text(a.zip, 3, 12) || undefined,
        roof_issue: text(a.roof_issue, 3, 200) || undefined,
        note: text(a.note, 2, 300) || undefined,
        status,
      };
      return { ok: true, value: v };
    }
    case 'schedule_followup': {
      const ch = a.channel, hrs = Number(a.when_hours);
      if (ch !== 'email' && ch !== 'sms') return bad('channel must be email or sms');
      if (ch === 'email' ? !isEmail(a.contact) : !isPhone(a.contact)) return bad('a valid contact is required');
      if (!Number.isInteger(hrs) || hrs < 1 || hrs > 168) return bad('when_hours must be an integer 1-168');
      return { ok: true, value: { channel: ch, contact: normContact(String(a.contact)), when_hours: hrs, hint: text(a.message_hint, 2, 200) || '' } };
    }
    default:
      return bad('unknown tool');
  }
}

// --------------------------------------------------------------- executors
export interface ToolEnv {
  db: Supabase | null;
  sessionId: string;
  allowedContacts: Set<string>;
  optOuts: Set<string>;
  companyName?: string;
  fetchFn?: Fetch;
}

const fail = (error: string): ToolResult => ({ ok: false, status: 'failed', simulated: false, persisted: false, error });

async function optedOut(contact: string, env: ToolEnv): Promise<boolean> {
  if (env.optOuts.has(contact)) return true;
  if (!env.db) return false;
  try { return await env.db.exists('contact_optouts', 'contact', contact); } catch { return false; }
}

export async function executeTool(name: string, rawArgs: unknown, env: ToolEnv): Promise<ToolResult> {
  const v = validateToolArgs(name, rawArgs);
  if (!v.ok) return fail(v.error);
  const a = v.value as Record<string, any>;
  const contact: string = a.phone || a.email || a.to || a.contact;
  if (!env.allowedContacts.has(contact) && !(a.email && env.allowedContacts.has(a.email))) {
    return fail('contact was not provided by the customer in this conversation');
  }
  try {
    switch (name) {
      case 'book_inspection': {
        if (await optedOut(a.phone, env)) return fail('contact opted out');
        const row = { session_id: env.sessionId, name: a.name, phone: a.phone, email: a.email ?? null, address_or_zip: a.address_or_zip, preferred_time: a.preferred_time, issue: a.issue, status: 'requested' };
        const saved = env.db ? await env.db.insert('inspection_requests', row) : null;
        return { ok: true, status: 'requested', simulated: !env.db, persisted: !!env.db, id: saved?.id,
          detail: 'Request recorded. A team member must confirm the time; do not tell the customer it is confirmed.' };
      }
      case 'send_message': {
        if (await optedOut(a.to, env)) return fail('contact opted out');
        // BOUNDARY: RoofFlow AI does not send email or SMS. There is deliberately
        // NO email-provider integration here (Resend was removed): the business
        // plan's constraint is that no message ever leaves the system, so every
        // send_message records an intent and reports itself as simulated. Wiring
        // a real provider back in is a product decision, not a plumbing one.
        const status = 'simulated_sent';
        const simulated = true;
        let persisted = false, id: string | undefined;
        if (env.db) {
          const saved = await env.db.insert('messages', { session_id: env.sessionId, channel: a.channel, recipient: a.to, subject: a.subject, body: a.body, status });
          persisted = true; id = saved.id;
        }
        return { ok: true, status, simulated, persisted, id,
          detail: 'Recorded only — no email or SMS is actually delivered by RoofFlow AI.' };
      }
      case 'update_crm': {
        const key = a.phone || a.email;
        if (a.status === 'Do Not Contact') {
          env.optOuts.add(key);
          if (a.phone) env.optOuts.add(a.phone);
          if (a.email) env.optOuts.add(a.email);
          if (env.db) await env.db.upsert('contact_optouts', { contact: key }, 'contact');
        }
        let id: string | undefined;
        if (env.db) {
          const saved = await env.db.upsert('leads', { session_id: env.sessionId, contact_key: key, phone: a.phone ?? null, email: a.email ?? null, name: a.name ?? null, zip: a.zip ?? null, roof_issue: a.roof_issue ?? null, status: a.status ?? null, note: a.note ?? null }, 'session_id,contact_key');
          id = saved.id;
        }
        return { ok: true, status: 'updated', simulated: !env.db, persisted: !!env.db, id };
      }
      case 'schedule_followup': {
        if (await optedOut(a.contact, env)) return fail('contact opted out');
        const due = new Date(Date.now() + a.when_hours * 3_600_000).toISOString();
        const saved = env.db ? await env.db.insert('followups', { session_id: env.sessionId, channel: a.channel, contact: a.contact, due_at: due, hint: a.hint, status: 'scheduled' }) : null;
        return { ok: true, status: 'scheduled', simulated: !env.db, persisted: !!env.db, id: saved?.id,
          detail: 'Recorded as scheduled. Delivery happens later via a worker, not now.' };
      }
    }
  } catch (e) {
    return fail(e instanceof Error && e.message.startsWith('storage') ? 'storage_error' : 'tool_error');
  }
  return fail('unknown tool');
}

// ------------------------------------------------------------- tool specs
const S = (type: string, description: string, extra: Record<string, unknown> = {}) => ({ type, description, ...extra });
const SPECS: Record<ToolName, { description: string; properties: Record<string, unknown>; required: string[] }> = {
  book_inspection: {
    description: 'Submit a free roof inspection REQUEST for a customer who agreed to book. A human confirms the final time.',
    properties: { name: S('string', 'Customer full name'), phone: S('string', 'Customer phone number'), email: S('string', 'Customer email (optional)'), address_or_zip: S('string', 'Property address or ZIP'), preferred_time: S('string', 'Customer-preferred day/time, in their words'), issue: S('string', 'Short description of the roof problem') },
    required: ['name', 'phone', 'address_or_zip', 'preferred_time', 'issue'],
  },
  send_message: {
    description: 'Send one email or SMS to a customer who asked for or agreed to it.',
    properties: { channel: S('string', 'email or sms', { enum: ['email', 'sms'] }), to: S('string', 'Email address or phone number'), subject: S('string', 'Email subject (email only)'), body: S('string', 'Message text') },
    required: ['channel', 'to', 'body'],
  },
  update_crm: {
    description: 'Update the CRM record for a lead (identified by phone or email). Use status "Do Not Contact" if they ask to stop.',
    properties: { phone: S('string', 'Lead phone'), email: S('string', 'Lead email'), name: S('string', 'Lead name'), zip: S('string', 'ZIP'), roof_issue: S('string', 'Roof issue'), status: S('string', 'New status', { enum: [...CRM_STATUSES] }), note: S('string', 'Short internal note') },
    required: [],
  },
  schedule_followup: {
    description: 'Schedule a future follow-up message to a lead (1-168 hours from now).',
    properties: { channel: S('string', 'email or sms', { enum: ['email', 'sms'] }), contact: S('string', 'Email or phone'), when_hours: S('integer', 'Hours from now, 1-168'), message_hint: S('string', 'What the follow-up should say') },
    required: ['channel', 'contact', 'when_hours'],
  },
};
export function toolSpecsFor(agent: AgentType) {
  return TOOL_SETS[agent].map((n) => ({ type: 'function', function: { name: n, description: SPECS[n].description, parameters: { type: 'object', properties: SPECS[n].properties, required: SPECS[n].required } } }));
}

// ------------------------------------------------------------- agent loop
export interface ChatMsg { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string; tool_calls?: unknown }
export interface AssistantMsg { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }
export type ChatFn = (messages: ChatMsg[], tools: unknown[] | null) => Promise<AssistantMsg>;

const MAX_ROUNDS = 3, MAX_CALLS_PER_ROUND = 3, MAX_ACTIONS = 5;

export async function runToolLoop(o: {
  agentType: AgentType; systemPrompt: string; messages: { role: 'user' | 'assistant'; content: string }[]; chat: ChatFn; env: ToolEnv;
}): Promise<{ reply: string; actions: ToolAction[] }> {
  const allowed = new Set<string>(TOOL_SETS[o.agentType]);
  const specs = toolSpecsFor(o.agentType);
  const convo: ChatMsg[] = [{ role: 'system', content: o.systemPrompt }, ...o.messages];
  const actions: ToolAction[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await o.chat(convo, specs);
    const calls = (msg.tool_calls || []).slice(0, MAX_CALLS_PER_ROUND);
    if (calls.length === 0) return { reply: (msg.content || '').trim(), actions };
    convo.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const c of calls) {
      let args: unknown = {};
      let result: ToolResult;
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { args = null; }
      if (!allowed.has(c.function.name)) result = fail('tool not available to this agent');
      else if (args === null) result = fail('arguments were not valid JSON');
      else if (actions.length >= MAX_ACTIONS) result = fail('action limit reached');
      else result = await executeTool(c.function.name, args, o.env);
      actions.push({ tool: c.function.name, args: (args && typeof args === 'object' ? args : {}) as Record<string, unknown>, result });
      convo.push({ role: 'tool', name: c.function.name, tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  const final = await o.chat(convo, null);
  let reply = (final.content || '').trim();
  if (!reply && actions.length) reply = 'Thanks. I have noted your request and a team member will follow up to confirm.';
  return { reply, actions };
}
