create table if not exists public.contractor_profiles (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  company_name        text,
  owner_name          text,
  phone               text,
  email               text,
  website             text,
  location            text,
  open_time           text,
  close_time          text,
  emergency_available boolean not null default false,
  emergency_phone     text,
  working_days        text[]  not null default '{}',
  services            text[]  not null default '{}',
  inspection_price    text,
  repair_price_min    text,
  repair_price_max    text,
  financing_available boolean not null default false,
  faqs                jsonb   not null default '[]'::jsonb,
  service_radius      text,
  years_in_business   text,
  license_number      text,
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.contractor_profiles enable row level security;

drop policy if exists contractor_profiles_select on public.contractor_profiles;
drop policy if exists contractor_profiles_insert on public.contractor_profiles;
drop policy if exists contractor_profiles_update on public.contractor_profiles;

create policy contractor_profiles_select on public.contractor_profiles
  for select to authenticated using (user_id = auth.uid());
create policy contractor_profiles_insert on public.contractor_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy contractor_profiles_update on public.contractor_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.contractor_profiles from anon;
