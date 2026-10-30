
// api/_lib/validators.ts — contact validation shared by the browser and the server.
// No imports on purpose: it runs in the React app, in Vercel functions and in tests.
// src/lib/validators.ts re-exports this file, so there is ONE set of rules.

export type Checked =
  | { ok: true; value: string }
  | { ok: false; error: string; kind: 'format' | 'placeholder' | 'disposable' | 'short' | 'long' | 'fake' };

const EMAIL_SHAPE =
  /^[a-z0-9](?:[a-z0-9._%+'-]*[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/;

const PLACEHOLDER_LOCALS = new Set([
  'test', 'tester', 'testing', 'test1', 'test123', 'asdf', 'asdfg', 'asdfgh', 'qwerty', 'qwert',
  'abc', 'abcd', 'abcde', 'abc123', 'aaa', 'xxx', 'xyz', 'none', 'noemail', 'nomail', 'no', 'na',
  'nobody', 'null', 'nil', 'email', 'myemail', 'youremail', 'yourname', 'name', 'user', 'username',
  'fake', 'fakeemail', 'demo', 'sample', 'example', 'foo', 'bar', 'foobar', 'johndoe', 'john.doe',
  'janedoe', 'jane.doe', 'noreply', 'no-reply', 'donotreply',
]);

const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.org', 'test.net', 'domain.com',
  'yourdomain.com', 'yoursite.com', 'sample.com', 'fake.com', 'fakemail.com', 'none.com',
  'noemail.com', 'nomail.com', 'asdf.com', 'asdf.org', 'email.test',
]);
const RESERVED_TLDS = ['.test', '.example', '.invalid', '.localhost', '.local'];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'trashmail.com', 'throwawaymail.com', 'sharklasers.com', 'getnada.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com',
]);

export function validateEmail(raw: unknown): Checked {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, kind: 'format', error: 'Please enter your email address.' };
  }
  const email = raw.trim().toLowerCase().replace(/^mailto:/, '');
  const formatError: Checked = {
    ok: false,
    kind: 'format',
    error: "That doesn't look like a valid email address (for example: name@company.com).",
  };
  if (email.length > 254 || /\s/.test(email) || email.includes('..') || !EMAIL_SHAPE.test(email)) {
    return formatError;
  }

  const [local, domain] = email.split('@') as [string, string];
  const firstLabel = domain.split('.')[0] ?? '';
  const isPlaceholder =
    PLACEHOLDER_LOCALS.has(local) ||
    PLACEHOLDER_DOMAINS.has(domain) ||
    RESERVED_TLDS.some((t) => domain.endsWith(t)) ||
    /^(.)\1{2,}$/.test(local) ||
    (local.length === 1 && local === firstLabel);
  if (isPlaceholder) {
    return {
      ok: false,
      kind: 'placeholder',
      error: "Please use your real email address. Placeholder addresses like test@test.com can't be used.",
    };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      ok: false,
      kind: 'disposable',
      error: "Temporary email addresses can't be used. Please use an address you check regularly.",
    };
  }
  return { ok: true, value: email };
}

/** Canonical value = digits only (a leading US "1" is dropped from 11-digit numbers). */
export function validatePhone(raw: unknown): Checked {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, kind: 'format', error: 'Please enter your phone number.' };
  }
  let text = raw.trim().replace(/(?:ext\.?|x)\s*\d{1,6}$/i, '').trim();
  if (!/^[+\d\s().-]+$/.test(text)) {
    return { ok: false, kind: 'format', error: 'Phone numbers can only contain digits, spaces, + ( ) and -.' };
  }
  const hasPlus = text.startsWith('+');
  text = text.replace(/\D/g, '');

  if (text.length < 10) {
    return { ok: false, kind: 'short', error: 'That phone number is too short. It needs at least 10 digits, including the area code.' };
  }
  if (text.length > 15) {
    return { ok: false, kind: 'long', error: 'That phone number has too many digits.' };
  }

  let digits = text;
  let nanp = false;
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
    nanp = true;
  } else if (digits.length === 10 && !hasPlus) {
    nanp = true;
  }

  const fake =
    /^(\d)\1+$/.test(digits) ||
    /(\d)\1{6,}/.test(digits) ||
    '01234567890123456789'.includes(digits) ||
    '98765432109876543210'.includes(digits);
  if (fake) {
    return { ok: false, kind: 'fake', error: "That phone number doesn't look real. Please enter a number we can call or text." };
  }
  if (nanp && /^[01]/.test(digits)) {
    return { ok: false, kind: 'format', error: "That area code isn't valid. Please check the number." };
  }
  return { ok: true, value: digits };
}

/** 10 digits -> (415) 555-2671, anything else -> +digits. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : `+${d}`;
}

const PLACEHOLDER_NAMES = new Set([
  'test', 'tester', 'asdf', 'qwerty', 'none', 'name', 'fake', 'na', 'n/a', 'xxx', 'abc',
  'unknown', 'anonymous', 'nobody', 'john doe', 'jane doe', 'your name', 'full name',
]);

export function validateName(raw: unknown): Checked {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  const letters = name.match(/\p{L}/gu)?.length ?? 0;
  if (
    name.length < 2 || name.length > 80 || letters < 2 ||
    !/^[\p{L}][\p{L}\p{M}\s.'’-]*$/u.test(name) ||
    PLACEHOLDER_NAMES.has(name.toLowerCase())
  ) {
    return { ok: false, kind: 'format', error: 'Please enter your full name.' };
  }
  return { ok: true, value: name };
}

/** First token that contains "@" (so "john@gmail" is caught and can be re-prompted). */
export function findEmailCandidate(text: string): string | undefined {
  const m = text.match(/[^\s,;()<>"']*@[^\s,;()<>"']*/);
  const token = m?.[0].replace(/[.!?]+$/, '');
  return token && token.length > 2 ? token : undefined;
}

/** A phone-like sequence: any 10+ digit run, or a number given right after "my phone is…". */
export function findPhoneCandidate(text: string): string | undefined {
  const cleaned = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  const withContext = cleaned.match(
    /\b(?:phone(?: number)?|cell(?: number)?|mobile(?: number)?|my number|call me(?: at| on)?|text me(?: at| on)?|reach me(?: at| on)?)\b[^\d+(]{0,25}(\+?\(?\d[\d\s().-]*\d)/i,
  );
  if (withContext?.[1]) return withContext[1].trim();
  const long = cleaned.match(/(?<![\d$])\+?\(?\d[\d\s().-]{8,}\d(?!\d)/);
  if (long && long[0].replace(/\D/g, '').length >= 10) return long[0].trim();
  return undefined;
}
