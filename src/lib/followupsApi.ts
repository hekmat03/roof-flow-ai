import { authHeaders } from './authFetch';

export interface FollowupMessage {
  id: string; lead_id: string | null; to_email: string; subject: string; send_at: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'; attempts: number;
  last_error: string | null; step: number | null; created_at: string; sent_at: string | null;
  sequence_key: string | null;
}
export interface FollowupStatus { configured: boolean; businessAddressReady: boolean; messages: FollowupMessage[] }

async function request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/followups', {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(await authHeaders()) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || `Follow-up request failed (${response.status}).`);
  return value;
}

export const fetchFollowupStatus = () => request<FollowupStatus>('GET');
export const queueFollowups = (action: 'sequence' | 'estimate', leadId: string, emails?: Array<{ step: number; subject: string; body: string }>) =>
  request<{ ok: true; messages?: FollowupMessage[]; recordedOnly?: boolean }>('POST', { action, leadId, ...(emails ? { emails } : {}) });
export const sendTestEmail = () => request<{ ok: true }>('POST', { action: 'test' });
export const cancelFollowup = (id: string) => request<{ ok: true }>('DELETE', { action: 'cancel', id });
export const cancelEstimateFollowup = (leadId: string) => request<{ ok: true }>('DELETE', { action: 'cancel-estimate', leadId });
