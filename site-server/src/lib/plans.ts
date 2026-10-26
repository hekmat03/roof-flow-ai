/**
 * Plan catalogue — the single source of truth for what a plan costs and what it
 * includes. Server-side authority: the app UI renders a copy of this, but every
 * check that gates a feature or a quota happens here, on the server.
 *
 * HONESTY RULE for this file: a feature may only appear in `includes` if it
 * demonstrably works today. Phone calls, SMS, email sending, autonomous
 * follow-ups and calendar booking are SIMULATED in this product and are never
 * advertised as plan features. They are listed once in `NOT_INCLUDED_ANY_PLAN`
 * so the UI can state the boundary out loud instead of hiding it.
 */

export type PlanId = "free" | "starter" | "pro";

export interface PlanCapabilities {
  /** Website chat widget that captures a lead into the CRM. */
  leadCaptureChatbot: boolean;
  /** Deterministic + LLM qualification questions inside the chat. */
  qualification: boolean;
  /** Server-side deterministic lead scoring (0–100). */
  leadScoring: boolean;
  /** CRM board: statuses, notes, transcript history. */
  crm: boolean;
  analytics: "basic" | "advanced" | "none";
  /** Push captured leads to the owner's own Google Sheet webhook. */
  sheetsPush: boolean;
  /** Edit company/city/storm/tone settings and agent system prompts. */
  customSettings: boolean;
  /** Interactive simulators for agents 2–4 (demo/sales console). */
  agentSimulators: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** USD per month. 0 for the free plan. */
  priceMonthlyUsd: number;
  /** Server-enforced conversations (one widget chat thread) per billing month. */
  conversationsPerMonth: number;
  /** Name of the env var holding the Stripe price id, or null when there is none. */
  priceEnvVar: string | null;
  tagline: string;
  includes: string[];
  capabilities: PlanCapabilities;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    conversationsPerMonth: 20,
    priceEnvVar: null,
    tagline: "Try the live chat capture with a real CRM behind it.",
    includes: [
      "Website chat widget — captures real leads into the CRM",
      "20 AI conversations per month (server-enforced)",
      "Basic lead capture: name + phone/email + ZIP + need",
      "Basic CRM board with statuses and transcripts",
      "All four agent simulators (demo/sales console)",
    ],
    capabilities: {
      leadCaptureChatbot: true,
      qualification: false,
      leadScoring: false,
      crm: true,
      analytics: "basic",
      sheetsPush: false,
      customSettings: false,
      agentSimulators: true,
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthlyUsd: 29,
    conversationsPerMonth: 200,
    priceEnvVar: "STRIPE_PRICE_STARTER",
    tagline: "Room for real traffic, with qualification and scoring.",
    includes: [
      "Everything in Free",
      "200 AI conversations per month (server-enforced)",
      "Full qualification script + objection handling",
      "Deterministic lead scoring (0–100) on every lead",
      "CRM management: statuses, notes, ownership",
      "Basic revenue + funnel analytics",
    ],
    capabilities: {
      leadCaptureChatbot: true,
      qualification: true,
      leadScoring: true,
      crm: true,
      analytics: "basic",
      sheetsPush: false,
      customSettings: false,
      agentSimulators: true,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 79,
    conversationsPerMonth: 750,
    priceEnvVar: "STRIPE_PRICE_PRO",
    tagline: "The full working product, tuned to one contractor's market.",
    includes: [
      "Everything in Starter",
      "750 AI conversations per month (server-enforced)",
      "Advanced analytics: revenue attribution by agent + source",
      "Google Sheets push of captured leads (when the owner connects a webhook)",
      "Custom company / city / storm / tone settings",
      "Editable system prompts for every agent",
    ],
    capabilities: {
      leadCaptureChatbot: true,
      qualification: true,
      leadScoring: true,
      crm: true,
      analytics: "advanced",
      sheetsPush: true,
      customSettings: true,
      agentSimulators: true,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro"];

/**
 * Stated once, in the product and in the UI. These are the things this product
 * does NOT do yet, whatever plan you are on — they are simulations.
 */
export const NOT_INCLUDED_ANY_PLAN: string[] = [
  "Phone calls — Agent 2 is an interactive simulation, there is no telephony provider",
  "SMS and email sending — no gateway is connected; sequences are simulated in-app",
  "Autonomous follow-ups — nothing runs on a schedule while you are away",
  "Calendar booking — inspections are recorded in the CRM, not written to a calendar",
];

/**
 * Default price ids used when the owner has not configured env overrides. Echo
 * `price_...` strings so a misconfigured dashboard is obvious rather than silent.
 */
export const DEFAULT_PRICE_IDS: Record<Exclude<PlanId, "free">, string> = {
  starter: "price_starter_placeholder",
  pro: "price_pro_placeholder",
};

export const isPlanId = (v: unknown): v is PlanId =>
  typeof v === "string" && (PLAN_ORDER as string[]).includes(v);

/**
 * Resolve the Stripe price id for a paid plan: env wins, default otherwise. A
 * placeholder id is never a real Stripe id, so it can only be used while
 * payments are dormant.
 */
export const priceIdForPlan = (plan: PlanId): string | null => {
  if (plan === "free") return null;
  const envVar = PLANS[plan].priceEnvVar;
  const fromEnv = envVar ? (process.env[envVar] ?? "").trim() : "";
  return fromEnv || DEFAULT_PRICE_IDS[plan];
};

/** Reverse lookup used by the Stripe webhook to map money back to a plan. */
export const planFromPriceId = (priceId: string | null | undefined): PlanId | null => {
  if (!priceId) return null;
  for (const id of PLAN_ORDER) {
    if (id === "free") continue;
    if (priceIdForPlan(id) === priceId) return id;
  }
  return null;
};

export const limitForPlan = (plan: PlanId): number => PLANS[plan].conversationsPerMonth;

/** True when the plan is merely a placeholder (no live Stripe price behind it). */
export const isPlaceholderPriceId = (priceId: string | null): boolean =>
  priceId !== null && Object.values(DEFAULT_PRICE_IDS).includes(priceId);

/** The catalogue as JSON-safe data for `GET /api/plans` (no env leakage). */
export const planCatalog = () => ({
  plans: PLAN_ORDER.map((id) => {
    const plan = PLANS[id];
    const priceId = priceIdForPlan(id);
    return {
      ...plan,
      priceIdConfigured: priceId !== null && !isPlaceholderPriceId(priceId),
    };
  }),
  notIncluded: NOT_INCLUDED_ANY_PLAN,
});
