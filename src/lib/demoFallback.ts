/**
 * Short built-in answers for the public demo chat on the landing page, used when the
 * live AI is unreachable or not configured. Every line states only what the product
 * really does today (keep in step with the landing page and api/_lib/plans.ts).
 */
const RULES: Array<{ test: RegExp; reply: string }> = [
  {
    test: /\b(sms|texts?|texting|text message)/i,
    reply: 'RoofFlow does not send text messages. The chat happens on your website, and you follow up yourself. On Starter and Pro you can also schedule follow-up emails.',
  },
  {
    test: /\b(phone call|voice|calls?|calling|telephon)/i,
    reply: 'RoofFlow does not make or answer live phone calls. The voice agent is a practice simulator you talk to in the browser; no phone line is connected.',
  },
  {
    test: /\b(price|pricing|cost|plans?|free|starter|pro|credit card|subscription|cancel)\b/i,
    reply: 'Free is $0 with 20 chats a month. Starter is $19 for 250 chats, the CRM board and email follow-ups. Pro is $39 for 1,000 chats and every feature. No credit card to start, and you can cancel any time.',
  },
  {
    test: /how (does|do|is) .*work|how it works|lead response|respon(d|se)\b|what does (it|roofflow)( ai)? do/i,
    reply: 'RoofFlow adds a chat to your roofing website. It asks about the roof concern, collects contact details with consent, and files the whole conversation in your CRM for you to follow up.',
  },
  {
    test: /\b(crm|pipeline|board|leads?\b|status)/i,
    reply: 'Leads from your website chat land on a CRM board with the full conversation attached. You move them from New Lead through Inspection Scheduled and Estimate Sent to Closed-Won. The board is on Starter and Pro.',
  },
  {
    test: /\b(calendar|inspection|inspect|book|booking|schedule|appointment)/i,
    reply: 'Connect Google Calendar and an inspection request becomes a calendar event with an invite and a 24-hour email reminder.',
  },
  {
    test: /\b(email|e-mail|follow.?up|sequence|unsubscribe|nurture)/i,
    reply: 'On Starter and Pro you can schedule follow-up emails to leads who agreed to be contacted. Every email has an unsubscribe link and your business mailing address.',
  },
  {
    test: /\b(widget|install|embed|script|add it|website|web site|set ?up)/i,
    reply: 'You add one script tag to your website. A chat bubble appears that asks about the roof concern and ZIP, collects contact details with consent, and sends the lead to your CRM.',
  },
  {
    test: /\b(consent|privacy|private|secure|security|who can see|data|gdpr|permission)/i,
    reply: 'Visitors must agree to follow-up before anything is submitted. Your leads are visible only to people in your workspace, and other companies cannot see them.',
  },
  {
    test: /\b(team|user|users|invite|admin|member|staff|employee|role)/i,
    reply: 'You can invite up to 10 teammates as admins or members. Everyone shares your leads. Only the owner changes the plan and billing.',
  },
  {
    test: /\b(verif|valid|real person|fake|spam)/i,
    reply: 'RoofFlow checks that phone numbers and emails are in a valid format. It cannot prove they belong to the person who typed them.',
  },
  {
    test: /\b(how|work|respon|reply|answer|what does|what is|about)\b/i,
    reply: 'RoofFlow adds a chat to your roofing website. It asks about the roof concern, collects contact details with consent, and files the whole conversation in your CRM for you to follow up.',
  },
];

export const GENERIC_DEMO_REPLY =
  'RoofFlow AI adds a chat to your roofing website, collects homeowner inquiries with their consent, and keeps them in a CRM. This demo does not collect contact details or save anything.';

export function demoFallbackReply(question: string): string {
  const q = question.trim();
  if (!q) return GENERIC_DEMO_REPLY;
  return RULES.find((rule) => rule.test.test(q))?.reply ?? GENERIC_DEMO_REPLY;
}
