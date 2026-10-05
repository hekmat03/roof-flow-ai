/**
 * webhook.ts — Google Sheets webhook CRM push.
 * ----------------------------------------------------------------------------
 * POSTs lead data as JSON to a configurable URL (e.g. a Google Apps Script
 * Web App that appends rows to a Sheet). Hard requirements:
 *   - No-op (resolves false) when no URL is configured.
 *   - Never throws: network errors, timeouts and non-2xx responses are logged
 *     to the console and swallowed.
 *   - 8s timeout via AbortController.
 * ----------------------------------------------------------------------------
 */

export const WEBHOOK_URL_STORAGE = 'roofflow_webhook_url';
export const WEBHOOK_TIMEOUT_MS = 8000;

export interface LeadWebhookPayload {
  name: string;
  phone: string;
  email: string;
  zip: string;
  roofIssue: string;
  status: string;
  source: string;
  timestamp: string;
}

export function getWebhookUrl(): string {
  try {
    return (localStorage.getItem(WEBHOOK_URL_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function setWebhookUrl(url: string): void {
  try {
    localStorage.setItem(WEBHOOK_URL_STORAGE, url.trim());
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/**
 * Push a lead to the configured webhook. Returns true when the webhook was
 * configured AND the POST succeeded. Resolves false for no-op/failure —
 * never rejects.
 */
export async function postLeadToWebhook(lead: LeadWebhookPayload): Promise<boolean> {
  const url = getWebhookUrl();
  if (!url) return false; // not configured → no-op

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[webhook] non-2xx response', res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[webhook] push failed (swallowed):', err instanceof Error ? err.message : err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}