-- Keep historic step-3 messages valid while the current email sequence uses
-- days 1, 2, 4, and 7. This changes the constraint only; existing rows remain.
alter table public.scheduled_messages
  drop constraint if exists scheduled_messages_step_check;

alter table public.scheduled_messages
  add constraint scheduled_messages_step_check
  check (step is null or step in (1, 2, 3, 4, 7));
