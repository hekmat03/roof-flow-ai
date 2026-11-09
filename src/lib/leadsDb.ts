import { supabase } from './supabase';
import type { Lead, CompanySettings, PurchaseRecord, CustomerStatus } from '../context/AppContext';

/** Row shape of public.leads (only the columns the app uses). */
interface LeadRow {
  id: string;
  tenant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  zip_code: string | null;
  zip?: string | null;
  roof_issue: string | null;
  roofing_need?: string | null;
  status: string | null;
  customer_status?: string | null;
  property_ownership: string | null;
  scheduled_date: string | null;
  appointment: Lead['appointmentDetails'] | null;
  agent_type: string | null;
  conversation: Lead['chatLog'] | null;
  purchase_history?: PurchaseRecord[] | null;
}

export interface CompanyInfo {
  id: string;
  name: string;
  city?: string;
  role?: string;
}

export const ABC_ROOFING_TENANT_ID = '11111111-aaaa-4111-8111-111111111111';
export const XYZ_ROOFING_TENANT_ID = '22222222-bbbb-4222-8222-222222222222';

export const DEFAULT_COMPANIES: CompanyInfo[] = [
  { id: ABC_ROOFING_TENANT_ID, name: 'ABC Roofing', city: 'Dallas, TX', role: 'owner' },
  { id: XYZ_ROOFING_TENANT_ID, name: 'XYZ Roofing', city: 'Fort Worth, TX', role: 'owner' },
];

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    name: r.name ?? '',
    phone: r.phone ?? '',
    email: r.email ?? 'N/A',
    propertyOwnership: (r.property_ownership as Lead['propertyOwnership']) ?? 'Owner',
    status: (r.status as Lead['status']) ?? 'New Lead',
    customerStatus: (r.customer_status as CustomerStatus) ?? 'Lead',
    scheduledDate: r.scheduled_date ?? '',
    appointmentDetails: r.appointment ?? undefined,
    zipCode: r.zip_code ?? r.zip ?? 'N/A',
    roofIssue: r.roof_issue ?? r.roofing_need ?? '',
    agentType: (r.agent_type as Lead['agentType']) ?? 'Chatbot',
    chatLog: r.conversation ?? [],
    purchaseHistory: Array.isArray(r.purchase_history) ? r.purchase_history : [],
  };
}

export function leadToRow(l: Lead, tenantId: string): LeadRow {
  return {
    id: l.id,
    tenant_id: tenantId,
    name: l.name,
    phone: l.phone,
    email: l.email,
    zip_code: l.zipCode,
    roof_issue: l.roofIssue,
    status: l.status,
    customer_status: l.customerStatus ?? 'Lead',
    property_ownership: l.propertyOwnership,
    scheduled_date: l.scheduledDate ?? null,
    appointment: l.appointmentDetails ?? null,
    agent_type: l.agentType,
    conversation: l.chatLog,
    purchase_history: l.purchaseHistory ?? [],
  };
}

export async function fetchLeads(tenantId: string): Promise<Lead[]> {
  const { data, error } = await client()
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as LeadRow[]).map(rowToLead);
}

export async function upsertLeads(tenantId: string, leads: Lead[]): Promise<void> {
  if (leads.length === 0) return;
  const { error } = await client()
    .from('leads')
    .upsert(leads.map((l) => leadToRow(l, tenantId)), { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteLeads(tenantId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client()
    .from('leads')
    .delete()
    .eq('tenant_id', tenantId)
    .in('id', ids);
  if (error) throw error;
}

/** Look up the signed-in user's tenant id (null if signed out / no profile). */
export async function fetchMyTenantId(): Promise<string | null> {
  const c = client();
  const { data: userData } = await c.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await c
    .from('profiles')
    .select('tenant_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.tenant_id as string | null) ?? null;
}

/** Fetch all companies accessible to the user (via profile and memberships). */
export async function fetchUserCompanies(): Promise<CompanyInfo[]> {
  const c = client();
  const { data: userData } = await c.auth.getUser();
  if (!userData.user) return DEFAULT_COMPANIES;

  try {
    const [{ data: profile }, { data: memberships }] = await Promise.all([
      c.from('profiles').select('tenant_id').eq('user_id', userData.user.id).maybeSingle(),
      c.from('organization_memberships').select('tenant_id, role').eq('user_id', userData.user.id),
    ]);

    const tenantIds = new Set<string>();
    if (profile?.tenant_id) tenantIds.add(profile.tenant_id);
    if (memberships) {
      memberships.forEach((m: { tenant_id: string }) => tenantIds.add(m.tenant_id));
    }

    if (tenantIds.size === 0) {
      return [];
    }

    const { data: tenantRows } = await c
      .from('tenants')
      .select('id, name, settings')
      .in('id', Array.from(tenantIds));

    if (!tenantRows || tenantRows.length === 0) {
      return [];
    }

    const companies: CompanyInfo[] = tenantRows.map((t: { id: string; name: string; settings?: { city?: string } }) => ({
      id: t.id,
      name: t.name,
      city: t.settings?.city,
      role: memberships?.find((m: { tenant_id: string; role?: string }) => m.tenant_id === t.id)?.role || 'owner',
    }));

    return companies;
  } catch {
    return [];
  }
}

export const fetchAvailableTenants = fetchUserCompanies;

export async function fetchTenantConfig(
  tenantId: string,
): Promise<{ settings: Partial<CompanySettings> }> {
  const { data, error } = await client()
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  return {
    settings: (data?.settings ?? {}) as Partial<CompanySettings>,
  };
}

export async function saveTenantConfig(
  tenantId: string,
  settings: CompanySettings,
): Promise<void> {
  const { error } = await client()
    .from('tenants')
    .update({ settings })
    .eq('id', tenantId);
  if (error) throw error;
}
