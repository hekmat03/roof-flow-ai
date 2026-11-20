-- RoofFlow AI: opt-in automatic email follow-ups. Idempotent.
-- When on, a lead that confirms its email is enrolled in the Day 1/2/4/7 sequence.
alter table public.contractor_profiles
  add column if not exists email_autofollowup boolean not null default false;
