export const MIN_BUSINESS_ADDRESS_LENGTH = 10;

export function normalizeBusinessAddress(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function hasBusinessAddress(value: string | null | undefined): boolean {
  return typeof value === 'string' && normalizeBusinessAddress(value).length >= MIN_BUSINESS_ADDRESS_LENGTH;
}
