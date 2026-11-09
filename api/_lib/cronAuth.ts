import { timingSafeEqual } from 'node:crypto';

export function hasCronAuthorization(header: string | undefined, secret: string | undefined): boolean {
  if (!header || !secret?.trim()) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(secret.trim());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
