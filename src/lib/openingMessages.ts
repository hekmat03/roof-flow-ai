type Opener = (company: string, greeting: string) => string;

// Each opener uses a different strategy and ends with ONE question.
// No "free" or price claims: those depend on each contractor's own info.
const OPENERS: Opener[] = [
  // 1. Direct symptom check
  (c, g) =>
    `${g}! I'm the AI assistant for ${c}. Have you noticed any leaks, missing shingles or storm damage on your roof?`,

  // 2. Open-ended
  (c, g) =>
    `${g}, and welcome to ${c}. I'm an AI assistant. What brings you here today?`,

  // 3. Roof age
  (c) =>
    `Hi there! I'm ${c}'s AI assistant. Roughly how old is your roof?`,

  // 4. Insurance angle
  (c) =>
    `Hello! I'm the AI assistant for ${c}. Are you dealing with an insurance claim, or just looking for a roof check-up?`,

  // 5. Urgency triage
  (c) =>
    `Hi, I'm ${c}'s AI assistant. Is this an urgent problem like an active leak, or are you planning ahead?`,

  // 6. Service menu
  (c, g) =>
    `${g}! I'm an AI assistant for ${c}. Are you looking for a repair, a full replacement, or an inspection?`,

  // 7. Low pressure
  (c) =>
    `Welcome to ${c}! I'm an AI assistant, and there's no rush. What would you like to know about your roof?`,

  // 8. Problem-first
  (c) =>
    `Hi there, I'm ${c}'s AI assistant. What's the one thing about your roof that's worrying you most?`,
];

const LAST_KEY = 'roofflow_last_opener';

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Hello';
}

/** Random opening message; never repeats the previous one on this browser. */
export function pickOpening(companyName?: string): string {
  const company = (companyName || '').trim() || 'our roofing team';

  let last = -1;
  try {
    const raw = localStorage.getItem(LAST_KEY);
    last = raw === null ? -1 : Number(raw);
  } catch {
    /* storage blocked: fine */
  }

  let i = Math.floor(Math.random() * OPENERS.length);
  if (OPENERS.length > 1 && i === last) i = (i + 1) % OPENERS.length;

  try {
    localStorage.setItem(LAST_KEY, String(i));
  } catch {
    /* ignore */
  }

  return OPENERS[i](company, greetingForNow());
}
