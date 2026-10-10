/**
 * aiResponseGenerator.ts
 * ----------------------------------------------------------------------------
 * RoofFlow AI — Deterministic, settings-aware, offline AI response generator.
 *
 * This module powers ALL four conversational agents (chatbot / phone /
 * nurturer / closer) with dynamic, intent-aware replies. It deliberately has
 * ZERO runtime imports so it can be unit-tested with plain Node (see
 * tests/generator.test.ts) and bundled anywhere.
 *
 * Design (matching the owner's six-point QA checklist):
 *  - Intent detection uses word-bounded, priority-ordered regular expressions
 *    so a message like "my insurance denied the hail damage" resolves to the
 *    SUPPLEMENT branch (higher priority) rather than the generic INSURANCE one.
 *  - Reply banks are keyed by [agentType][intent], interpolated with
 *    companySettings (companyName, city, stormName, stormDate,
 *    financingOptions, agentTone) so Configuration changes propagate to every
 *    simulator automatically (checklist item 4).
 *  - Variant selection is deterministic: the same input always yields the same
 *    reply (stable demo), while different formulations of the same intent pick
 *    different variants, so responses visibly vary by input (checklist item 1).
 *  - Every path falls back to a per-agent "unknown" reply — no empty strings,
 *    no silent errors.
 * ----------------------------------------------------------------------------
 */

export type AgentType = 'chatbot' | 'phone' | 'nurturer' | 'closer';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentContext {
  companyName?: string;
  city?: string;
  stormEvent?: string;
  stormDate?: string;
  leadName?: string;
  financingOptions?: string;
  agentTone?: string;
  /**
   * Optional forced intent. Phone/sequence simulators pass this so a
   * dialogue step's AI turn is always generated from the right branch even
   * when the canned option text is ambiguous on its own.
   */
  replyIntent?: Intent;
}

export type Intent =
  | 'hail'
  | 'leak'
  | 'insurance'
  | 'supplement'
  | 'finance'
  | 'cost'
  | 'free'
  | 'competitor'
  | 'warranty'
  | 'renter'
  | 'owner'
  | 'schedule'
  | 'scheduleask'
  | 'optout'
  | 'urgency'
  | 'yes'
  | 'no'
  | 'busy'
  | 'greeting'
  | 'thanks'
  | 'unknown';

/* ------------------------------------------------------------------------- */
/* Intent detection — priority ordered (first match wins)                     */
/* ------------------------------------------------------------------------- */

const INTENT_PATTERNS: Array<[Intent, RegExp]> = [
  ['optout', /\b(?:stop|unsubscribe|take\s+me\s+off|remove\s+me|no\s+more\s+(?:calls|texts|emails)|don'?t\s+contact)\b/i],
  ['urgency', /\b(?:urgent|emergency|actively\s+leaking|water\s+(?:pouring|coming)\s+in|ceiling\s+(?:caving|collaps)|can'?t\s+wait|leak\s+right\s+now|rain\s+coming\s+in)\b/i],
  ['schedule', /\b(?:book|schedule|appointment|slot|reserve|sign\s+(?:me|up)|set\s+(?:it|one)\s+up|let'?s\s+do\s+it|morning\s+slots?|afternoon\s+slots?|tomorrow\s+(?:morning|afternoon|works|at)|this\s+(?:week|friday|thursday)|free\s+(?:tomorrow|today|this\s+week)|can\s+i\s+get\s+(?:booked|scheduled)|calendar)\b/i],
  ['warranty', /\b(?:warranty|guarantee|workmanship|lifetime\s+coverage|transferable)\b/i],
  ['competitor', /\b(?:competitor|competition|another\s+(?:contractor|company|roofer|bid)|other\s+(?:contractor|company|roofer)|cheaper\s+bid|price\s+(?:match|matching)|second\s+opinion|lower\s+quote|beat\s+that\s+price)\b/i],
  ['supplement', /\b(?:supplement|denied|denial|short[- ]?paid|under[- ]?paid|rejected|payout\s+(?:won'?t|doesn'?t|didn'?t)|insurance\s+is\s+only\s+covering|won'?t\s+cover|not\s+covering\s+the\s+whole)\b/i],
  ['insurance', /\b(?:insurance|insurance\s+company|adjuster|claim|carrier|policy|deductible\s+check|state\s+farm|allstate|liberty|travelers|usaa|geico|progressive)\b/i],
  ['finance', /\b(?:financ|pay(?:ing|ment)?|deductible|budget|monthly|0%\s*apr|apr|low[- ]?interest|credit\s+check|cash\s+(?:to\s+pay|on\s+hand|right\s+now)|can'?t\s+afford|don'?t\s+have\s+the\s+money|payment\s+plan)\b/i],
  ['leak', /\b(?:leak(?:s|ing|ed)?|mold|mildew|water\s+(?:damage|stain|stains|drip)|ceiling\s+stain|stains?\s+on\s+the\s+ceiling|granules?\s+in\s+the\s+gutter|rotting|rot\b|structural)\b/i],
  ['hail', /\b(?:hail(?:storm)?|storm\b|storm\s+damage|wind\s+damage|tornado|damage|denting|dents|missing\s+shingles|shingles?\s+(?:blown|missing|damaged)|roof\s+damage|impact\s+(?:craters|marks))\b/i],
  ['renter', /\b(?:rent|landlord|lease|tenant|renter|i\s+don'?t\s+own|living\s+there\s+but\s+don'?t\s+own)\b/i],
  ['owner', /\b(?:i\s+own\s+(?:the\s+)?(?:home|house|property)|homeowner|i'?m\s+(?:the\s+)?owner|my\s+property|yes\s+i\s+am\s+the\s+owner)\b/i],
  ['cost', /\b(?:how\s+much|what\s+(?:does|do)\s+(?:it|you)\s+cost|cost\s+of|price|quote|estimate\s+(?:cost|price)|pricing|expensive|free\s+estimate\s+cost)\b/i],
  ['free', /\b(?:free|no\s+cost|no\s+charge|no\s+obligation|no\s+strings|complimentary|at\s+no\s+charge)\b/i],
  ['yes', /\b(?:^|\W)(?:yes|yep|yeah|sure|ok(?:ay)?|correct|absolutely|definitely|perfect|that\s+works|sounds\s+good|go\s+ahead)(?:\W|$)\b/i],
  ['thanks', /\b(?:thank\s+(?:you|u|s)|thanks|appreciate\s+it|i'?m\s+good,\s+thanks)\b/i],
  ['no', /\b(?:no\b|nope|not\s+(?:interested|right\s+now|yet)|i'?m\s+fine|leave\s+it|not\s+for\s+now)\b/i],
  ['busy', /\b(?:busy|at\s+work|working|can'?t\s+be\s+home|no\s+time|hard\s+to|not\s+home|during\s+the\s+day)\b/i],
  ['greeting', /\b(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|howdy|greetings|hi\s+there)\b/i],
];

const DEFAULT_INTENT: Intent = 'unknown';

/** Detect the best intent for a single user utterance (priority-ordered). */
export function detectIntent(
  input: string,
  _agentType: AgentType = 'chatbot',
  _context?: AgentContext
): Intent {
  if (!input || !input.trim()) return DEFAULT_INTENT;
  const haystack = ` ${input.trim().toLowerCase()} `;
  for (const [intent, regex] of INTENT_PATTERNS) {
    if (regex.test(haystack)) return intent;
  }
  return DEFAULT_INTENT;
}

/* ------------------------------------------------------------------------- */
/* Deterministic variant selection                                            */
/* ------------------------------------------------------------------------- */

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickVariant(bank: string[], seed: string): string {
  const h = hashString(seed);
  return bank[h % bank.length];
}

/* ------------------------------------------------------------------------- */
/* Settings interpolation                                                     */
/* ------------------------------------------------------------------------- */

function interpolate(template: string, ctx: AgentContext): string {
  const company = ctx.companyName || 'RoofFlow AI Roofing';
  const city = ctx.city || 'Dallas-Fort Worth';
  const storm = ctx.stormEvent || 'Great Hailstorm of 2026';
  const stormDate = ctx.stormDate || 'May 15, 2026';
  const financing = ctx.financingOptions || '0% APR for 12 months, or low-interest plans starting at $99/mo';
  const tone = ctx.agentTone || 'Professional, reassuring, hazard-focused, and highly helpful';
  const leadName = ctx.leadName || 'there';

  return template
    .split('{{company}}').join(company)
    .split('{{city}}').join(city)
    .split('{{storm}}').join(storm)
    .split('{{stormDate}}').join(stormDate)
    .split('{{financing}}').join(financing)
    .split('{{tone}}').join(tone)
    .split('{{toneLow}}').join(tone.toLowerCase())
    .split('{{leadName}}').join(leadName);
}

/* ------------------------------------------------------------------------- */
/* Reply banks — [agentType][intent] = variant list                            */
/* ------------------------------------------------------------------------- */

type Bank = Record<Intent, string[]>;

const CHATBOT_BANK: Bank = {
  hail: [
    `I'm really sorry to hear that — hail the size of a golf ball can crack the fiberglass backing of shingles even when they look fine from the street. After the {{storm}} on {{stormDate}}, roofs across {{city}} are showing hidden impact damage. The good news: a professional inspection is completely free, and if we find damage, we'll photograph every mark for your insurance claim. Would you like to book an inspection this week?`,
    `That's exactly what we're seeing after the {{storm}}. Hail damage doesn't always show up as missing shingles — micro-cracks let water in months later. That's why we're offering free inspections in {{city}} right now. I can get a specialist out to you; a full digital photo report is included at no charge. Should I set that up?`,
  ],
  leak: [
    `A leak after a storm is a sign the shingles have been compromised — water gets in through the nail line and rots the decking underneath. In {{city}}, we treat these as time-sensitive: the longer water sits, the higher the mold and structural risk. We can come out for a free inspection and tell you exactly where it's entering and whether your {{storm}} insurance claim should cover it. Can I grab your address to schedule?`,
    `Ceiling stains and mold usually mean the underlayment has failed — that's structural damage, not cosmetic. We'd want a specialist to see it quickly. The inspection and photo report are free, and we work directly with your insurance on {{storm}} claims. Would a morning or afternoon slot work better for you?`,
  ],
  insurance: [
    `Great question — we handle insurance claims every single day here in {{city}}. After the {{storm}} on {{stormDate}}, most homeowners' policies cover storm damage, including full roof replacement if the shingles are compromised. We send a detailed, photo-backed report to your adjuster and will meet them on-site if needed. We can start with a free inspection so you have documentation before you even file. Want to get that scheduled?`,
    `Yes — we're an insurance-first operation. Unlike general contractors, we document every hail impact and code-compliance issue so your adjuster approves the full scope. The free inspection gives you the evidence you need before contacting your carrier. Should we book yours?`,
  ],
  supplement: [
    `If your adjuster denied or underpaid parts of the claim, that's exactly what our supplement service is for. We re-document the scope with manufacturer specifications and code-compliance requirements for {{city}}, then submit a formal supplement to get the denied areas approved. It's included when you work with {{company}} — no extra cost to you. Would you like us to review your current claim?`,
    `Denials are common on hail claims — adjusters often miss impact craters on the north-facing slope. We write a detailed supplement report with direct manufacturer specs and meet your adjuster on-site. That typically gets the denied shingle damage approved. Can we start a free inspection to build that report for you?`,
  ],
  finance: [
    `You shouldn't have to choose between a damaged roof and your budget. {{company}} offers {{financing}}, so you can get the repair done now with low, manageable payments. We can run a soft credit check that won't affect your score — whether your insurance covers it or not. Want to see if you qualify?`,
    `That's completely understandable — most homeowners don't have cash sitting around for a roof. That's why we offer {{financing}}. We'll also work your insurance claim first so your out-of-pocket is as small as possible. Can I schedule a free inspection so we can give you exact numbers?`,
  ],
  cost: [
    `The inspection is 100% free — no cost, no obligation, and you keep the digital photo report either way. If we do find damage, replacements are usually covered by your homeowners insurance under the {{storm}} claim, so most homeowners pay little to nothing out of pocket. Want to book your free inspection?`,
    `A full roof health inspection from {{company}} costs you nothing. If there's damage, we photograph and document everything for your insurance, and if there isn't, you get peace of mind and the report. That's the whole offer. Should I schedule yours?`,
  ],
  free: [
    `Completely free — the inspection, the digital drone report, and the claim documentation. No strings, no obligation. If your roof survived the {{storm}} without damage, you keep the report and we move on. If it didn't, we help you use it to file a claim. Want to lock in a slot this week?`,
    `Yes, 100% free with no obligation. We provide a full digital photo report for your records or for your insurance company — either way you walk away with it. Does a morning or afternoon visit work better for you?`,
  ],
  competitor: [
    `We always match local bids for an equivalent scope of work. Just make sure their estimate includes what we consider standard: full synthetic underlayment, ice-and-water shield in the valleys, and a lifetime workmanship warranty. We're happy to do a line-by-line comparison of their quote against ours so you can see if they're cutting corners. May I send it over?`,
    `Price is a fair conversation. Bring us the competitor's quote and we'll match it for the same scope — but check for the details: drip edge, starter shingles, nail-in patterns, ventilation. Those add up fast and most low bids skip them. Want to compare your quote side by side?`,
  ],
  warranty: [
    `Every roof we install carries a lifetime workmanship warranty on top of the manufacturer's shingle warranty, and it's fully transferable if you sell the home. That's a promise you can't get from a storm-chaser crew that disappears next season. Would you like the details when our specialist comes out?`,
    `We stand behind our work for as long as you own the home — lifetime workmanship coverage, transferable to the next buyer. The manufacturer warranty covers the shingles themselves, and we handle the paperwork for you. That's part of why insurance companies trust {{company}} in {{city}}.`,
  ],
  renter: [
    `Got it — since the owner has to authorize any work on the roof, the property owner will need to give the go-ahead for an inspection. But here's the important part: hail damage from the {{storm}} is the homeowner's repair responsibility, and most landlord policies won't cover a storm-damaged roof unless it's claimed properly. We can help you document the damage and send it to the landlord, and they can still get a free inspection on the building. Would that help?`,
    `Understood — you rent. The good news is storm damage reporting still matters: your landlord needs a documented inspection to file a claim, and you shouldn't wait — leaks from {{storm}} damage can affect your deposit and your stuff. We can share a free inspection report with your landlord directly. Shall we get one scheduled?`,
  ],
  owner: [
    `Perfect — since you own the home, we can schedule right away. We'll send a certified specialist for a free inspection, document everything for your {{storm}} insurance claim, and you'll have the digital report within 24 hours. What day works best for a morning or afternoon visit?`,
    `Great, thank you for confirming. As the owner you can authorize the inspection directly, so we're ready to book you. We have slots open this week in {{city}} — would tomorrow or Thursday work better?`,
  ],
  schedule: [
    `Perfect — let's get you scheduled! I'll open the booking form so you can confirm your name, phone, and a time that fits you. Our specialists in {{city}} have openings this week, and the inspection is completely free.`,
    `You've got it — booking a free inspection takes about 30 seconds. Fill in your details below and we'll confirm a time for a specialist to come out and document everything for your insurance claim after the {{storm}}.`,
  ],
  scheduleask: [
    `Let's find a time that works for you — do mornings or afternoons generally suit you better? Our specialists in {{city}} have openings this week.`,
    `What day works best for the visit — tomorrow, or later in the week? We have morning and afternoon slots open in {{city}}.`,
  ],
  optout: [
    `No problem at all — we'll mark you as not interested and stop contacting you. If you change your mind after the {{storm}} season, we're always here. Take care!`,
    `Understood, we'll remove you from the follow-up list right away. No hard feelings — and if you ever need a free inspection after the {{storm}}, we're one message away.`,
  ],
  urgency: [
    `This sounds urgent, so let's move fast. Water intrusion right now means the decking may already be rotting, and every day adds to the repair cost. We can prioritize your roof — our {{city}} crew can come out tomorrow. I'll open the booking form now so you're first on the list.`,
    `If water is coming in right now, don't wait — we'll treat this as an emergency visit. We can usually get a specialist out within 24 hours in {{city}}, and we'll document everything for your {{storm}} insurance claim so the repair is covered. Let's get you booked immediately.`,
  ],
  yes: [
    `Great — let's get moving on that. Would you like to book a free inspection for this week, or do you have questions about the process first? Either way I can help.`,
    `Excellent. To move forward I just need your name and best phone number, then we'll find a slot that works for you in {{city}}.`,
  ],
  no: [
    `No worries at all — I'm not here to push. For what it's worth, after the {{storm}} on {{stormDate}}, most damage in {{city}} doesn't show up until the next hard rain, which is why we suggest a quick look. The inspection stays free and no-strings. Just let me know if you'd like a slot.`,
    `Totally fine — no pressure. If anything changes (a leak, a missing shingle, a neighbor getting their roof replaced), we're one message away for a free inspection in {{city}}.`,
  ],
  busy: [
    `No problem — you don't even need to be home. Our technicians in {{city}} can do the inspection from the outside and send the full digital report to your phone or email. We can schedule around your work day entirely. Shall I grab a slot for you?`,
    `Totally understand. The good news: most of the inspection requires no access — we document from the roofline and send you everything digitally, so you can be at work the whole time. Want us to pick a time that suits you?`,
  ],
  greeting: [
    `Hi there! 👋 I'm the AI assistant for {{company}} here in {{city}}, and I keep things {{toneLow}} while looking out for homeowners. Storm season left a lot of roofs with hidden hail damage — if you're seeing anything, I can get a specialist out for a free inspection. What can I help you with?`,
    `Hello! Thanks for reaching out to {{company}}. I can help you check whether your roof took damage in the {{storm}} — leaks, missing shingles, or just peace of mind. The inspection is completely free. What are you seeing at your place?`,
  ],
  thanks: [
    `You're very welcome! Feel free to reach out anytime — the free inspection offer for {{city}} stands whenever you're ready. Have a great day!`,
    `Happy to help! If you'd like, I can still put you on the calendar for a free inspection — otherwise, take care and don't hesitate to message us after the next storm.`,
  ],
  unknown: [
    `I want to make sure I get you the right help. Just to confirm — are you dealing with storm or hail damage from the {{storm}}, a leak, or an insurance question? Either way, a free inspection in {{city}} covers all three. Should I schedule one?`,
    `Thanks for the message! To point you in the right direction: we offer free roof inspections, insurance claim documentation for {{storm}} damage, and repair financing. Which of those can I help you with today?`,
  ],
};

const PHONE_BANK: Bank = {
  hail: [
    `I am so sorry to hear that. Severe hail can cause micro-cracks that lead to major water leaks down the road. To get a certified specialist out to inspect your roof for FREE after the {{storm}}, can you confirm you are the owner of the property?`,
    `Thank you for letting me know. Hail impact from the {{storm}} often hides under the shingles, so a free inspection is the smart move. May I confirm you are the property owner so we can authorize the visit?`,
  ],
  leak: [
    `A leak means the decking may already be compromised, so we treat this as time-sensitive. We can get a certified inspector to your roof this week at no cost, and document everything for your {{storm}} insurance claim. Can you confirm you are the homeowner?`,
    `Water intrusion is exactly what we want to catch early. We can prioritize a free inspection in {{city}} and include a full digital report for your records. Are you the owner of the property?`,
  ],
  insurance: [
    `We handle insurance claims daily in {{city}}. After the {{storm}} on {{stormDate}}, most policies cover storm damage, including full replacement if the shingles are compromised. We meet your adjuster on-site with a photo-backed report. May I ask if you are the property owner?`,
    `Absolutely — we are an insurance-first roofing company. We document every impact so your carrier approves the full scope of work. To get the process started, can you confirm you own the property?`,
  ],
  supplement: [
    `If your adjuster denied or underpaid part of the claim, our supplement team can re-document the scope with manufacturer specifications and code-compliance requirements for {{city}}, then formally appeal it. There is no extra cost when you work with us. Would you like to start with a free inspection to build the report?`,
    `Denied areas are common on hail claims. We write a supplement with direct manufacturer specs and meet your adjuster on-site to get the scope approved. Let's start with a free inspection in {{city}} — can you confirm you are the owner?`,
  ],
  finance: [
    `You should not have to choose between a damaged roof and your budget. {{company}} offers {{financing}}, so you can move forward with low, manageable payments — and we run a soft credit check that does not affect your score. Would you like to see if you qualify?`,
    `That is incredibly common. We offer {{financing}}, and we also work your insurance claim first to keep out-of-pocket costs as low as possible. Can we schedule a free inspection so you have exact numbers?`,
  ],
  cost: [
    `The inspection is completely free, with no obligation, and we include a full digital photo report for your records or your insurance. If there is damage from the {{storm}}, most homeowners' policies cover it. May we schedule yours?`,
    `There is no cost for the inspection itself. We document everything digitally and help you file any {{storm}} claim that applies. Would a morning or afternoon slot work better?`,
  ],
  free: [
    `Yes — 100% free, no obligation, and the digital report is yours either way. We simply want to make sure your roof survived the {{storm}}. Can I set up a free inspection for you?`,
    `Completely free with no strings attached — the inspection and the photo report are on us. Should we book a slot this week?`,
  ],
  competitor: [
    `We always match local bids for an equivalent scope. Just confirm their quote includes synthetic underlayment, ice-and-water shield in the valleys, and a lifetime workmanship warranty — most low bids skip those. Would you like a line-by-line comparison of their estimate against ours?`,
    `Bring us the competitor's quote and we will match it for the same scope of work. Let's compare line by line so you can see what is included. Shall we set that up?`,
  ],
  warranty: [
    `Every roof we install carries a lifetime workmanship warranty, transferable if you sell, on top of the manufacturer's shingle warranty. That is standard from {{company}} in {{city}}. Would you like the full details when our specialist calls you?`,
    `We stand behind our work for as long as you own the home — lifetime workmanship coverage plus the manufacturer shingle warranty, with all paperwork handled for you. That is why insurance companies trust us. Shall we schedule the free inspection?`,
  ],
  renter: [
    `Ah, I see. Since safety regulations require the property owner to authorize physical roof climbing, we would need to coordinate with your landlord. Could you provide their name, or have them call us directly?`,
    `Understood — because the owner must authorize roof access, we will need to coordinate with your landlord. We can also send them a free inspection quote directly so they can file a {{storm}} claim on the building. May we get their contact?`,
  ],
  owner: [
    `Perfect. Because safety regulations require a homeowner to authorize inspection climbing, we can set this up instantly. Can I get your full name and best callback number?`,
    `Great, thank you for confirming. Since you own the property you can authorize the inspection directly — I just need your name and a callback number to set it up.`,
  ],
  schedule: [
    `Perfect! I have booked your Free Roof Inspection for tomorrow at 10:00 AM. A digital report with drone photography will be provided, and I have logged this under {{company}}. Is there anything else?`,
    `Consider it done — we will have a specialist at your property tomorrow morning at 10:00 AM with a full digital report for your insurance file with {{company}}. Is there anything else I can help with?`,
  ],
  scheduleask: [
    `Excellent, I have got that down. Now, let's look at scheduling. We have emergency roof inspectors available in {{city}} this week. Would a morning or afternoon slot work better for you?`,
    `Perfect — one last thing: scheduling. Our inspectors are available in {{city}} this week. Would a morning or afternoon visit work better for you?`,
  ],
  optout: [
    `Understood — we will mark your number as not interested and remove it from our call list. If you change your mind after the {{storm}}, we are always here to help. Take care.`,
    `No problem at all. We have noted your preference and will not call again. Wishing you the best.`,
  ],
  urgency: [
    `This sounds urgent, so we will prioritize your roof. Water intrusion right now means decking may already be rotting — I can have a {{city}} specialist out tomorrow. Let me confirm you are the owner and book you immediately.`,
    `If water is coming in right now, do not wait. We will treat this as an emergency visit in {{city}} and document everything for your {{storm}} claim. Can you confirm you are the homeowner so we can authorize the visit?`,
  ],
  yes: [
    `Excellent. To move forward, I just need your name and best callback number, then we will find a slot that works for you in {{city}}.`,
    `Great. We can have a specialist out this week — what is your name and best callback number?`,
  ],
  no: [
    `No worries — no pressure at all. For what it is worth, damage from the {{storm}} on {{stormDate}} often does not appear until the next hard rain. The inspection stays free whenever you are ready. Is there anything else I can help you with?`,
    `Totally fine. We will leave it here for now — if anything changes, you can always call us back for a free inspection in {{city}}.`,
  ],
  busy: [
    `No problem — you do not need to be home. Our technicians can complete the inspection from the roofline and send the full digital report to your phone. We can schedule entirely around your work day. Would that work for you?`,
    `Understood. The inspection requires no inside access — we document from the outside and email you everything. We can fit the visit around your schedule in {{city}}. Shall we proceed?`,
  ],
  greeting: [
    `Thank you for calling {{company}} Claim Support! This is our AI Voice Assistant. Are you calling about a roof inspection after the recent {{storm}}?`,
    `Good evening — you have reached {{company}} in {{city}}. Are you calling about storm damage from the {{storm}}, a leak, or a general roofing question?`,
  ],
  thanks: [
    `Thank you for calling! Goodbye!`,
    `You are very welcome — thank you for choosing {{company}}. Goodbye!`,
  ],
  unknown: [
    `I want to make sure I route you correctly. Are you calling about storm damage from the {{storm}}, a leak, an insurance question, or a general estimate? A free inspection covers all of those.`,
    `Thank you — I want to help with the right thing. Are you seeing hail damage, a leak, or would you like a general estimate in {{city}}?`,
  ],
};

const NURTURER_BANK: Bank = {
  hail: [
    `The {{storm}} on {{stormDate}} left impact damage on a LOT of roofs in {{city}} — often invisible from the street. A free inspection shows exactly what your insurance should cover. Want us to grab an address?`,
    `Quick heads up: hail from {{stormDate}} can crack shingles without you noticing until next winter. We can do a free drone inspection this week — no need to be home. Worth a look?`,
  ],
  leak: [
    `Ceiling stains or a musty smell usually mean the underlayment failed months ago — that's structural damage, not cosmetic. Our free inspection will pinpoint it and document it for your {{storm}} claim. Can we schedule?`,
    `Wanted to flag: post-storm leaks are the #1 reason hail damage becomes a $20k+ repair. A 15-minute check now keeps it small. Free, no need to be home. Should we come by?`,
  ],
  insurance: [
    `Most policies cover storm damage from {{stormDate}} — but claims have strict deadlines, and adjusters move faster when they have photos. We document everything on a free inspection. Want to book a slot?`,
    `Insurance reminder: after the {{storm}}, claims need documented shingle damage to be approved. The inspection report is free and yours to keep whether or not you file. Let us schedule it?`,
  ],
  supplement: [
    `If your adjuster short-paid the claim, our supplement team re-documents the scope with manufacturer specs and appeals it for you. Free inspection to start the report — interested?`,
    `Denied hail damage? We see it constantly. A properly documented supplement usually gets the full scope approved. Start with a free inspection in {{city}} — shall we set it up?`,
  ],
  finance: [
    `Worried about the deductible? {{financing}} — that's why we offer it. The free inspection comes first, then we figure out the best way to pay. Want to start?`,
    `No need to have the cash sitting around: {{company}} offers {{financing}}. The inspection itself is always free. Shall we book yours?`,
  ],
  cost: [
    `The inspection is 100% free with no obligation — you keep the digital photo report either way. Most {{storm}} repairs end up covered by insurance. Should we schedule?`,
    `Zero cost for the inspection, and if there's damage you keep the report for your insurance file. That's the whole deal. Want a slot this week?`,
  ],
  free: [
    `Yes — completely free, no strings. We photograph everything and you keep the report, whether or not you ever use us. Can we set up a time?`,
    `100% free with no obligation — the drone report is yours either way. Just say the word and we'll grab an address.`,
  ],
  competitor: [
    `Happy to match a competitor's quote for the same scope — but check if their bid includes synthetic underlayment, ice-and-water shield, and a lifetime warranty. Most low bids skip those. Want us to compare line by line?`,
    `Bring us the other quote and we'll match it for equivalent work, then show you exactly what's included in each. Fair?`,
  ],
  warranty: [
    `Every roof we install comes with a lifetime workmanship warranty that's transferable if you sell. On top of the manufacturer shingle warranty. Should our specialist bring the details?`,
    `We back our work for as long as you own the home — lifetime coverage, transferable. That's standard from {{company}}. Want to learn more?`,
  ],
  renter: [
    `Since the owner has to authorize roof work, we can send the free inspection report straight to your landlord — it's the documentation they need to file a {{storm}} claim on the building. Want us to start one?`,
    `No problem — we can document the damage from the street and share the report with your landlord so they can file the insurance claim. Free, quick, and helpful to you both. Shall we?`,
  ],
  owner: [
    `Perfect — since you own the home, we can book the inspection directly. We have slots this week in {{city}}. Morning or afternoon?`,
    `Great — owner confirmed! We can get a specialist out this week. Does tomorrow work, or the day after?`,
  ],
  schedule: [
    `Perfect — we'll get you scheduled. Just tell us a day and a rough time and we'll confirm your free inspection slot in {{city}}.`,
    `Let's lock it in. What day works best — we have morning and afternoon openings this week?`,
  ],
  scheduleask: [
    `Great news! We have openings this week in {{city}}. Would tomorrow morning or afternoon work better for you?`,
    `Let's find a time that suits you — do you prefer mornings or afternoons? We have slots available this week.`,
  ],
  optout: [
    `No problem — you're off our list. If the {{storm}} damage ever starts leaking, we're one text away. Take care!`,
    `Understood — we'll stop messaging you. Thanks for letting us know, and best of luck!`,
  ],
  urgency: [
    `If water is coming in right now, don't wait — we can prioritize a visit and document it for your {{storm}} claim today. Want me to arrange an emergency slot?`,
    `This sounds time-sensitive. We can have a specialist out within 24 hours in {{city}} — free, photo report included. Should we lock that in?`,
  ],
  yes: [
    `Awesome! Send us your address and a good time (morning or afternoon) and we'll confirm your free inspection slot.`,
    `Great — to confirm, just reply with your address and whether tomorrow morning or afternoon works. Done in 30 seconds!`,
  ],
  no: [
    `No worries at all — we'll back off. Just so you know, the free inspection stays on the table if anything changes after the {{storm}}. Have a great day!`,
    `Totally fine — no pressure. If a leak or missing shingle shows up later, we're one text away.`,
  ],
  busy: [
    `No need to be home for this one — the inspection happens from the outside and you get the full report by email. We can work around your schedule completely. Want to pick a time?`,
    `Totally get it — you can be at work the whole time. We inspect from the roofline and send everything digitally. Shall we book a slot for you?`,
  ],
  greeting: [
    `Hi {{leadName}}! 👋 This is {{company}} — we help homeowners in {{city}} check for hidden damage after the {{storm}}. Free inspection, digital report included. Curious?`,
    `Hey {{leadName}}! Quick note from {{company}}: we're offering free post-storm inspections in {{city}} right now. Takes 15 minutes, no need to be home. Interested?`,
  ],
  thanks: [
    `You're welcome! The free inspection offer stands whenever you're ready. Take care!`,
    `Anytime! If you change your mind, we're a text away. Have a great day!`,
  ],
  unknown: [
    `I want to help with exactly what you need — leak, hail damage from the {{storm}}, insurance, or a general question? A free inspection covers all of them.`,
    `Thanks for replying! Just to make sure: are you interested in a free inspection, or do you have a specific question about your roof?`,
  ],
};

const CLOSER_BANK: Bank = {
  hail: [
    `The hail impact we documented during your inspection is consistent with the {{storm}} on {{stormDate}} — that's why we recommend moving forward while the claim window is open and before leaks develop. Would you like us to proceed with the estimate?`,
    `Based on the {{storm}} damage we photographed, your insurer should cover the full scope. We can file everything on your behalf — shall we get started on confirming the estimate?`,
  ],
  leak: [
    `You're seeing the leak now because the decking is saturated — that's exactly why we recommended moving fast. Your estimate covers the repair and the insurance documentation to go with it. Want us to kick off scheduling?`,
    `The active leak confirms what we saw during inspection: the underlayment has failed. The good news is your estimate includes the moisture barrier work and lifetime warranty. Shall we schedule the install?`,
  ],
  insurance: [
    `We work directly with your insurer to align payment schedules — and if parts of the claim get denied, our supplement team handles the appeal at no extra cost to you. You shouldn't have to manage this alone. Shall we start the claim paperwork?`,
    `Insurance is why most of our jobs go smoothly: we document everything, meet your adjuster on-site, and chase supplements so you don't have to. Want us to handle yours end to end?`,
  ],
  supplement: [
    `We handle insurance discrepancies all the time! We can write a detailed supplement report with digital photos and direct manufacturer specifications for your adjuster. Typically, denied areas get approved once we show code-compliance requirements in {{city}}. We'll meet them on-site if needed. Shall we set up a call with our claim supplement team?`,
    `Denied shingle damage is fixable — our supplement team re-documents the scope with manufacturer specs and appeals the denial. It's included with your estimate from {{company}}. Should we get that started this week?`,
  ],
  finance: [
    `That is incredibly common, and you shouldn't let an active leak damage your home structure. We offer excellent financing plans: {{financing}}. This allows you to get the roof fixed immediately with low, manageable monthly payments. We can run a soft-credit check that doesn't affect your score. Would you like to see if you qualify?`,
    `Budget shouldn't gate a critical repair. With {{financing}}, your monthly payment stays small, and we'll first exhaust every insurance dollar available on your claim. Want me to walk you through the numbers?`,
  ],
  cost: [
    `Your estimate is itemized line by line — materials, labor, dumpster, permits, warranty. If any line is unclear or you'd like to adjust scope, tell me which one and we'll go through it. Also, if insurance approves the claim, most of this is covered. Shall we review it together?`,
    `I understand price matters — let's walk through exactly what's in your estimate. You'll see the synthetic underlayment, ice-and-water shield, and lifetime warranty that cheaper bids often leave out. Want me to send the line-by-line breakdown?`,
  ],
  free: [
    `Your inspection and digital report were already free — no catch. The estimate is the next step only if you want to move forward. Nothing you've paid so far, nothing you owe unless we install. Shall we schedule?`,
    `Right — the inspection cost you nothing and the photo report is yours to keep. The estimate you received is simply the next step whenever you're ready. No obligation. Want to talk through timing?`,
  ],
  competitor: [
    `I completely understand wanting the best price! We always match local bids for equivalent scopes of work. However, make sure their bid includes full synthetic underlayment, ice/water shields in valleys, and a lifetime workmanship warranty, which is standard for {{company}}. Would you like us to do a line-by-line comparison of their estimate to see if they're cutting corners?`,
    `Bring us their quote and we'll match it for the same scope — then we'll lay both estimates side by side so you can see exactly what's included. Contractors who can't do a line-item comparison usually can't do the work either. Want us to set that up?`,
  ],
  warranty: [
    `Every install carries a lifetime workmanship warranty, transferable to the next owner, plus the manufacturer's shingle warranty — both backed in writing. That's protection a lower bid simply can't match. Should we lock in your install date?`,
    `The warranty is what protects you for the long haul: lifetime workmanship, transferable, on top of the manufacturer's coverage. We handle all the paperwork. Shall we get you on the schedule?`,
  ],
  renter: [
    `Since you rent, the owner needs to authorize the work — we can route the estimate and insurance documentation straight to them and coordinate approvals. Would you like us to send it over?`,
    `We can absolutely work with your landlord on this — the estimate transfers to whoever owns the property, and we coordinate the claim paperwork with them. Want us to get in touch?`,
  ],
  owner: [
    `Perfect — as the owner, you can authorize the install directly. We can start as soon as the insurance paperwork clears (or sooner with financing). Shall we target a start date?`,
    `Great — you're authorized to move forward, so we just need a start date. We'll handle the rest: permits, materials, insurance coordination. What week works best?`,
  ],
  schedule: [
    `Let's get you on the calendar. We can start within 7–10 days in {{city}} once we confirm materials. What day works best for the crew to begin?`,
    `Perfect — scheduling is the last step. We'll confirm a start date, then keep you posted at every stage with photos. Shall we lock it in?`,
  ],
  scheduleask: [
    `Let's pick a start date. We can begin within 7–10 days in {{city}} — what week works best for the crew to start?`,
    `Scheduling is the last step. Do you have a preferred week for us to begin? We'll confirm around your availability.`,
  ],
  optout: [
    `Understood — we'll close your file and stop reaching out. The estimate and photo report stay valid for 30 days if you change your mind. Best of luck with the roof!`,
    `No problem — we'll mark your file as closed. If the {{storm}} damage starts leaking, call us before it becomes structural. Take care!`,
  ],
  urgency: [
    `If the leak is active, we should start this week — every day of delay raises the damage behind the walls. We can prioritize your start date and keep the insurance filing moving in parallel. Want me to reserve the earliest slot?`,
    `This is urgent enough that I'd advise starting as soon as possible. We'll stage materials immediately and work around your schedule. Shall I put you on the priority list?`,
  ],
  yes: [
    `Great — let's get you moving. I'll confirm your install date and send the summary; our office will reach out for the deposit and logistics. Anything else you want covered before we start?`,
    `Excellent — you're all set to proceed. We'll lock your materials this week and confirm the start date shortly. Is there anything you'd like to adjust first?`,
  ],
  no: [
    `Understood — we'll keep your file open for now. The estimate stays valid for 30 days, and we'll be here if you decide to move forward. Is it the timing, the price, or something else we can help clarify?`,
    `No problem — no pressure at all. Before we close the file, is there any part of the estimate or process you'd like more clarity on? Happy to answer anything.`,
  ],
  busy: [
    `Let's work around your schedule — we can handle most of it remotely: paperwork, insurance coordination, and progress photos. You'd only need to be present for a quick final walk-through. Want to set that up?`,
    `Totally understandable. We'll manage everything — permits, insurance, materials — and give you a single point of contact so it takes minimal time on your end. Shall we proceed?`,
  ],
  greeting: [
    `Hi {{leadName}}! This is the {{company}} estimate follow-up. Did you get a chance to review the replacement estimate we sent after your inspection? Happy to walk through any part of it.`,
    `Hello {{leadName}}! We're checking in on your roof replacement estimate from {{company}}. Do you have any questions on scope, pricing, timing, or insurance?`,
  ],
  thanks: [
    `You're very welcome! We'll be in touch with next steps. And remember — the estimate's good for 30 days. Take care!`,
    `Anytime! We're here when you're ready to move forward. Have a great day!`,
  ],
  unknown: [
    `I'm here to help with your estimate — insurance, financing, timing, or the scope of work, you name it. Which would you like to dig into? Or we can schedule a call with our office to walk through it together.`,
    `Happy to clarify anything on the estimate — pricing lines, the warranty, the insurance process, or scheduling. What's on your mind?`,
  ],
};

const BANKS: Record<AgentType, Bank> = {
  chatbot: CHATBOT_BANK,
  phone: PHONE_BANK,
  nurturer: NURTURER_BANK,
  closer: CLOSER_BANK,
};

/* ------------------------------------------------------------------------- */
/* Public API                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Generate the next AI reply for an agent given the full conversation.
 * Deterministic: identical (agentType, messages, context) always returns the
 * same reply; different inputs select different variants/banks.
 */
export function generateAgentReply(
  agentType: AgentType,
  messages: AgentMessage[],
  context: AgentContext = {}
): string {
  const bank = BANKS[agentType] || CHATBOT_BANK;

  // Latest user utterance drives intent (or a forced intent from the caller).
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const input = (lastUser?.content || context.leadName || '').trim();

  let intent: Intent;
  if (context.replyIntent) {
    intent = context.replyIntent;
  } else {
    intent = detectIntent(input, agentType, context) || DEFAULT_INTENT;
  }

  const variants = bank[intent] || bank[DEFAULT_INTENT];
  const seed = `${agentType}|${intent}|${input}|${messages.length}|${context.stormEvent || ''}`;
  const template = pickVariant(variants, seed);

  return interpolate(template, context);
}

/** Convenience: detect intent for the most recent user message. */
export function detectLatestIntent(messages: AgentMessage[], context?: AgentContext): Intent {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  return detectIntent(lastUser?.content || '', 'chatbot', context);
}

/** All intents (exposed for tests / future UI). */
export const INTENTS: Intent[] = INTENT_PATTERNS.map(([intent]) => intent);
