// Email env resolution. Accepts RESEND_API_KEY as an alias, falls back to Resend's
// shared test sender, and derives the base URL from Vercel's production URL.
export const emailApiKey = (): string | undefined =>
  process.env.EMAIL_PROVIDER_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim() || undefined;

// onboarding@resend.dev works without a verified domain, but Resend only delivers
// it to the account owner's own address. Set EMAIL_FROM once a domain is verified.
export const emailFrom = (): string | undefined =>
  process.env.EMAIL_FROM?.trim() || (emailApiKey() ? 'RoofFlow <onboarding@resend.dev>' : undefined);

export const emailBaseUrl = (): string | undefined =>
  process.env.APP_BASE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
