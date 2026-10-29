import { supabase } from './supabase';
import type { Lead, CompanySettings, AgentPrompts } from '../context/AppContext';

interface LeadRow {
  id: string;
  tenant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  zip_code: string | null;
  roof_issue: string | null;
  status: string | null;
  property_ownership: string | null;
  scheduled_date: string | null;
  appointment: Lead['appointmentDetails'] | null;
  agent_type: string | null;
  conversation: Lead['chatLog'] | null;
}

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
    scheduledDate: r.scheduled_date ?? '',
    appointmentDetails: r.appointment ?? undefined,
    zipCode: r.zip_code ?? 'N/A',
    roofIssue: r.roof_issue ?? '',
    agentType: (r.agent_type as Lead['agentType']) ?? 'Chatbot',
    chatLog: r.conversation ?? [],
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
    property_ownership: l.propertyOwnership,
    scheduled_date: l.scheduledDate ?? null,
    appointment: l.appointmentDetails ?? null,
    agent_type: l.agentType,
    conversation: l.chatLog,
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

export async function fetchTenantConfig(
  tenantId: string,
): Promise<{ settings: Partial<CompanySettings>; prompts: Partial<AgentPrompts> }> {
  const { data, error } = await client()
    .from('tenants')
    .select('settings, prompts')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  return {
    settings: (data?.settings ?? {}) as Partial<CompanySettings>,
    prompts: (data?.prompts ?? {}) as Partial<AgentPrompts>,
  };
}

export async function saveTenantConfig(
  tenantId: string,
  settings: CompanySettings,
  prompts: AgentPrompts,
): Promise<void> {
  const { error } = await client()
    .from('tenants')
    .update({ settings, prompts })
    .eq('id', tenantId);
  if (error) throw error;
}
