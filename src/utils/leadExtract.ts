/**
 * leadExtract.ts — free-form contact extraction for the conversational agents.
 * ----------------------------------------------------------------------------
 * Used by Agent 1 (chat capture), Agent 3 (nurture replies) and Agent 4 to pull
 * real contact details out of free-form user messages so leads are captured
 * from conversation instead of forms only. All functions are pure and
 * conservative: they return undefined rather than guess.
 * ----------------------------------------------------------------------------
 */

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 10-digit NANP-style phone, with optional +1, parens and separators. */
export const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;

/** Common words that must never be mistaken for a stated name. */
const NAME_STOPWORDS = new Set([
  'free', 'ready', 'interested', 'here', 'looking', 'calling', 'the', 'a', 'an',
  'not', 'so', 'very', 'just', 'now', 'done', 'good', 'fine', 'back', 'sure',
  'available', 'in', 'on', 'at', 'home', 'owner', 'renting', 'rent', 'yes',
  'yeah', 'no', 'okay', 'ok', 'hi', 'hello', 'thanks', 'thank', 'please',
  'wondering', 'trying', 'going', 'having', 'hearing', 'seeing', 'from',
  'and', 'with', 'was', 'is', 'are', 'my', 'me', 'we', 'she', 'he', 'they',
  'our', 'your', 'it', 'its', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'there', 'then', 'but', 'about', 'for', 'very',
]);

/** "My name is John Smith" / "I'm Jane" / "this is Bob" / "John Smith here". */
// Trigger words handle common capitalizations explicitly ("I am"/"i am",
// "My name is"/"my name is") WITHOUT making the captured name
// case-insensitive — continuation words must stay Capitalized, which stops
// false grabs like "Bob from State" out of "this is Bob from State Farm".
const NAME_PATTERNS = [
  /\b(?:[Mm]y name(?:'s|\s+is)|[Ii](?:'m|\s+am)|[Tt]his is)\s+([A-Za-z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/,
  /\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)\s+here\b/,
];

export function extractEmail(text: string): string | undefined {
  return text.match(EMAIL_RE)?.[0];
}

export function extractPhone(text: string): string | undefined {
  const raw = text.match(PHONE_RE)?.[0];
  if (!raw) return undefined;
  // Reject pure repeating-digit junk like "0000000000".
  return /^(\d)\1+$/.test(raw.replace(/\D/g, '')) ? undefined : raw.trim();
}

export function extractName(text: string): string | undefined {
  for (const re of NAME_PATTERNS) {
    const m = text.match(re)?.[1];
    if (!m) continue;
    const words = m.trim().split(/\s+/);
    const plausible =
      words.length > 0 &&
      words.every(w => /^[A-Za-z][a-zA-Z'.-]*$/.test(w)) &&
      !words.some(w => NAME_STOPWORDS.has(w.toLowerCase()));
    if (plausible) return m.trim();
  }
  return undefined;
}

/** 5-digit ZIP that is not part of a phone number. */
export function extractZip(text: string): string | undefined {
  const withoutPhones = text.replace(new RegExp(PHONE_RE.source, 'g'), ' ');
  const m = withoutPhones.match(/(?<!\d)\d{5}(?!\d)/);
  return m?.[0];
}

/** Best-effort roof-issue label from the visitor's own words. */
export function deriveRoofIssue(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/hail/.test(t)) return 'Hail / storm damage';
  if (/leak|drip|water stain|ceiling stain/.test(t)) return 'Active roof leak';
  if (/wind/.test(t)) return 'Wind damage';
  if (/missing|damaged|broken/.test(t) && /shingle|tile|slate/.test(t)) return 'Damaged shingles';
  if (/storm/.test(t)) return 'Storm damage';
  return undefined;
}
