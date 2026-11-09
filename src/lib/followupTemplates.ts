export type FollowupDay = 1 | 2 | 4 | 7;
export interface FollowupEmailDraft { subject: string; body: string }

/** Contractor-specific, low-pressure copy used for the editable email preview. */
export function makeFollowupEmailTemplates(
  name: string,
  companyName: string,
  city: string,
): Record<FollowupDay, FollowupEmailDraft> {
  const greeting = name.trim() ? `Hi ${name.trim()},` : 'Hello,';
  const business = companyName.trim() || 'our team';
  const market = city.trim() || 'your area';
  return {
    1: { subject: 'Following up on your roof', body: `${greeting}\n\nThanks for reaching out to ${business} in ${market}. Would you like to book a free roof inspection? Reply and we can find a time that works for you.` },
    2: { subject: 'Can we help with your roof?', body: `${greeting}\n\n${business} is checking in about your roofing inquiry in ${market}. If a free roof inspection would be helpful, reply and we will help arrange one.` },
    4: { subject: 'Free roof inspection', body: `${greeting}\n\nIf you are still looking for help with your roof, ${business} can arrange a free inspection in ${market}. Reply to this email if you would like to book.` },
    7: { subject: 'Here if you need roofing help', body: `${greeting}\n\nThis is our last scheduled follow-up. ${business} is here if you would still like to book a free roof inspection in ${market}. Reply whenever it is convenient.` },
  };
}
