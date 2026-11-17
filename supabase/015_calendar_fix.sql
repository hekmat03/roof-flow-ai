-- Fix: the Google Calendar API code reads/writes these columns, but 004_calendar.sql
-- created different ones, so connecting a calendar always failed with "error".
-- Safe to run more than once. Run in Supabase -> SQL Editor.

alter table public.calendar_connections
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists contractor_email text,
  add column if not exists encrypted_refresh_token text,
  add column if not exists connected_at timestamptz not null default now();

-- Tokens stay server-only (the API uses the service role).
alter table public.calendar_connections enable row level security;
revoke all on table public.calendar_connections from anon, authenticated;
