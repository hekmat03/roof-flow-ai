-- Calendar connection storage for each tenant.
-- Run this migration in the Supabase SQL Editor.

create table if not exists public.calendar_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null default 'google',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  connected_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;

-- OAuth tokens must never be readable or writable directly by browser clients.
revoke all on table public.calendar_connections from anon, authenticated;

create index if not exists calendar_connections_updated_at_idx
  on public.calendar_connections (updated_at);
