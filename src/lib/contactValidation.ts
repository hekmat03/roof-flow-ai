/** Strict contact validation — fake or malformed values are never saved to CRM. */

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const FAKE_LOCAL = /^(test|fake|asdf|foo|bar|none|n\/?a|email|user|admin|sample|demo|xxx|placeholder)$/i;
const FAKE_DOMAIN =
  /@(test|fake|example|asdf|mailinator|tempmail|throwaway|guerrillamail|yopmail|placeholder)(\.|$)/i;

const SEQUENTIAL = new Set([
  '1234567890',
  '0123456789',
  '9876543210',
  '0987654321',
]);

export function isValidEmail(raw: string | undefined | null): boolean {
  const email = (raw ?? '').trim();
  if (!email || email.length > 254) return false;
  if (!EMAIL_RE.test(email)) return false;
  const local = email.split('@')[0] ?? '';
  if (FAKE_LOCAL.test(local)) return false;
  if (FAKE_DOMAIN.test(email)) return false;
  if (/(.)\1{5,}/.test(local)) return false;
  return true;
}

/** NANP-style 10-digit numbers; rejects obvious junk. */
export function isValidPhone(raw: string | undefined | null): boolean {
  const digits = (raw ?? '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(national)) return false;
  if (SEQUENTIAL.has(national)) return false;
  if (national.startsWith('555') || national.startsWith('000') || national.startsWith('111')) return false;
  return true;
}

export const INVALID_EMAIL_PROMPT =
  "That email doesn't look quite right. Could you share a real email address so our team can reach you?";

export const INVALID_PHONE_PROMPT =
  "I want to make sure we can actually reach you — could you share a valid 10-digit phone number?";
