// Safety limits. These are NOT billing: there are no plans, prices or monthly
// chat quotas any more. They only stop one conversation or one mailbox from
// running away (AI cost, spam complaints, email-provider bans).

/** Max messages inside one conversation (enforced by the consume_chat SQL function). */
export const MAX_MESSAGES_PER_CONVERSATION = 60;

/**
 * consume_chat() (supabase/002_billing.sql) still takes a monthly number.
 * This is deliberately far beyond reach, i.e. "no monthly chat limit".
 */
export const NO_MONTHLY_CHAT_LIMIT = 1_000_000_000;

/** Follow-up emails a company can send per day / per month. */
export const EMAIL_DAILY_CAP = 100;
export const EMAIL_MONTHLY_CAP = 1000;
