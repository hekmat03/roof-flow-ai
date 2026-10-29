const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'invalid',
  'localhost',
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
]);
const PLACEHOLDER_LOCALS = new Set([
  'test',
  'fake',
  'placeholder',
  'noemail',
  'none',
  'yourname',
  'youremail',
  'email',
  'name',
]);

export function validateContactEmail(value: string): string | null {
  const email = value.trim();
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  const [local = '', domain = ''] = email.toLowerCase().split('@');
  if (
    PLACEHOLDER_LOCALS.has(local) ||
    RESERVED_DOMAINS.has(domain) ||
    domain.endsWith('.example') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.test') ||
    domain.endsWith('.localhost')
  ) {
    return 'Please use a real email address, not a sample or placeholder.';
  }
  return null;
}

export function validateContactPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'Enter a phone number with 10–15 digits.';
  if (/^(\d)\1+$/.test(digits)) return 'Enter a real phone number.';
  return null;
}

/** A polite prompt only when the visitor has actually tried to share contact data. */
export function contactCorrectionPrompt(message: string): string | null {
  const emailLike = message.match(/[^\s@]+@[^\s@]+/);
  if (emailLike) {
    const error = validateContactEmail(emailLike[0].replace(/[.,;:!?]+$/, ''));
    if (error) return `${error} Please send your email again.`;
  }

  const phoneLike = message.match(/(?:\+?\d[\d\s().-]{5,}\d)/g) ?? [];
  const attemptedPhone = phoneLike.find((candidate) => candidate.replace(/\D/g, '').length >= 7);
  if (attemptedPhone && validateContactPhone(attemptedPhone)) {
    return 'Please send a valid phone number with at least 10 digits.';
  }
  return null;
}
