-- ============================================================================
-- RoofFlow AI — 012: verified lead email (double opt-in)
-- Safe to re-run. Run in Supabase -> SQL Editor BEFORE deploying the code that
-- reads leads.email_verified_at.
--
-- Why: leads come from a public widget, so "consent" and the conversation text
-- are attacker-controlled. An email address now only becomes emailable after
-- the owner of that inbox clicks the confirmation link (server, service role).
-- Existing leads stay unverified on purpose (nothing is grandfathered in).
-- ============================================================================

alter table public.leads
  add column if not exists email_verified_at timestamptz;

-- Only the server (service_role) may SET email_verified_at. Everyone else keeps
-- the old value, and any change of the email address clears verification.
create or replace function public.leads_guard_email_verified()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not is_service then
      new.email_verified_at := null;
    end if;
    return new;
  end if;

  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    new.email_verified_at := null;
  elsif not is_service then
    new.email_verified_at := old.email_verified_at;
  end if;
  return new;
end
$$;

drop trigger if exists leads_guard_email_verified on public.leads;
create trigger leads_guard_email_verified
  before insert or update on public.leads
  for each row execute function public.leads_guard_email_verified();

-- Queue inserts from the browser now also require a verified address.
-- (This also drops the old `conversation ilike` test, which treated "_" and "%"
-- inside an address as wildcards.)
drop policy if exists scheduled_messages_own_insert on public.scheduled_messages;
create policy scheduled_messages_own_insert on public.scheduled_messages
  for insert to authenticated with check (
    tenant_id = public.my_tenant() and status = 'pending' and channel = 'email'
    and exists (
      select 1 from public.leads l
       where l.id = lead_id
         and l.tenant_id = public.my_tenant()
         and l.consent is true
         and l.email_verified_at is not null
         and lower(l.email) = lower(to_email)
    )
  );
