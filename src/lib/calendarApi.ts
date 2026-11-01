export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export interface InspectionEventInput {
  name: string;
  phone: string;
  email: string;
  issue: string;
  zip?: string;
  startsAt: string;
  notes?: string;
}

export interface InspectionEvent {
  eventId: string;
  htmlLink: string | null;
}

async function requestJson<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'The calendar service could not complete this request.');
  return payload as T;
}

export const getCalendarStatus = (token: string) =>
  requestJson<CalendarStatus>('/api/google/status', token);

export const startCalendarConnection = (token: string) =>
  requestJson<{ url: string }>('/api/google/connect', token, { method: 'POST' });

export const createInspectionEvent = (token: string, input: InspectionEventInput) =>
  requestJson<{ ok: true; eventId: string; htmlLink: string | null }>('/api/google/events', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
