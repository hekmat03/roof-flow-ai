-- RoofFlow AI — run once in Supabase → SQL Editor.
-- RLS is ON with NO policies: the browser (anon key) can read/write nothing.
-- Only the server (service-role key, kept in Vercel env vars) can access data.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  contact_key text not null,
  phone text, email text, name text, zip text, roof_issue text, status text, note text,
  updated_at timestamptz not null default now(),
  unique (session_id, contact_key)
);
create table if not exists inspection_requests (
  id uuid primary key default gen_random_uuid(),
  session_id text not null, name text not null, phone text not null, email text,
  address_or_zip text not null, preferred_time text not null, issue text not null,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null, channel text not null, recipient text not null,
  subject text, body text not null, status text not null,
  created_at timestamptz not null default now()
);
create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  session_id text not null, channel text not null, contact text not null,
  due_at timestamptz not null, hint text, status text not null default 'scheduled',
  created_at timestamptz not null default now()
);
create table if not exists contact_optouts (
  contact text primary key,
  created_at timestamptz not null default now()
);

alter table leads enable row level security;
alter table inspection_requests enable row level security;
alter table messages enable row level security;
alter table followups enable row level security;
alter table contact_optouts enable row level security;
