import { authHeaders } from './authFetch';

/**
 * realLeads.ts — client for OUR OWN /api/leads endpoint.
 * ---------------------------------------------------------------------------
 * Real leads are captured by the embeddable widget and stored server-side
 * (Supabase). This module fetches them for the CRM board. It never touches a
 * service key: the browser sends the signed-in user's own access token and the
 * server returns ONLY that user's company's leads (401 when nobody is signed in).
 *
 * Failure is ALWAYS explicit here — a missing database, a network error and an
 * empty result are three different, distinguishable states, because "we could
 * not reach storage" must never look like "no leads exist".
 */

export interface RealLeadTurn {
  sender: string;
  text: string;
  timestamp: string;
}

export interface RealLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  zip_code: string | null;
  roofing_need: string | null;
  consent: boolean | null;
  consent_text: string | null;
  conversation: RealLeadTurn[] | null;
  lead_score: number | null;
  status: string | null;
  source: string | null;
  user_agent: string | null;
  created_at: string;
}

export type RealLeadsState = 'loading' | 'ok' | 'not-configured' | 'signed-out' | 'error';

export interface RealLeadsResult {
  state: RealLeadsState;
  leads: RealLead[];
  /** Human-readable explanation for the non-'ok' states. */
  message?: string;
  /** This company's public widget key, for the embed snippet (state 'ok' only). */
  widgetKey?: string;
}

export const fetchRealLeads = async (): Promise<RealLeadsResult> => {
  try {
    const res = await fetch('/api/leads', {
      headers: { Accept: 'application/json', ...(await authHeaders()) },
      credentials: 'same-origin',
    });
    if (res.status === 401) {
      return { state: 'signed-out', leads: [], message: 'Sign in to see your website leads.' };
    }
    if (res.status === 503) {
      return {
        state: 'not-configured',
        leads: [],
        message:
          'Live capture is not switched on yet — the owner still needs to connect the database ' +
          '(SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). The widget shows a friendly "try again later" until then.',
      };
    }
    if (!res.ok) {
      return { state: 'error', leads: [], message: `Lead storage returned ${String(res.status)}.` };
    }
    const body = (await res.json()) as { ok?: boolean; leads?: RealLead[]; widget_key?: string | null };
    if (!body.ok) {
      return { state: 'error', leads: [], message: 'Lead storage responded with an error.' };
    }
    return {
      state: 'ok',
      leads: Array.isArray(body.leads) ? body.leads : [],
      widgetKey: typeof body.widget_key === 'string' ? body.widget_key : undefined,
    };
  } catch {
    return {
      state: 'error',
      leads: [],
      message: 'Could not reach the lead service (offline, or the site server is restarting).',
    };
  }
};

/** Formats the server timestamp for display; falls back to the raw value. */
export const formatCapturedAt = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Score → tier label + the tailwind classes the CRM uses for it. */
export const scoreTier = (score: number | null): { label: string; className: string } => {
  const s = typeof score === 'number' ? score : 0;
  if (s >= 75) return { label: 'Hot', className: 'text-accent-400 bg-accent-500/10 border-accent-500/30' };
  if (s >= 45) return { label: 'Warm', className: 'text-accent-300 bg-accent-500/10 border-accent-500/30' };
  return { label: 'Cool', className: 'text-accent-300 bg-accent-500/10 border-accent-500/30' };
};
