import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyOwnership: 'Owner' | 'Renter';
  status: 'New Lead' | 'Contacted' | 'In Contact' | 'Inspection Scheduled' | 'Inspection Completed' | 'Estimate Sent' | 'Closed-Won' | 'Closed-Lost' | 'Follow-up Nurture' | 'Closed';
  scheduledDate?: string;
  calendarEventId?: string;
  appointmentDetails?: {
    date: string;
    time: string;
    notes?: string;
  };
  zipCode: string;
  roofIssue: string;
  agentType: 'Chatbot' | 'Phone Call' | 'SMS Nurture' | 'Estimate Follow-Up';
  chatLog: Array<{ sender: 'User' | 'AI' | 'System'; text: string; timestamp: string }>;
}

export interface CompanySettings {
  companyName: string;
  city: string;
  stormName: string;
  stormDate: string;
  financingOptions: string;
  agentTone: string;
}

export interface AgentPrompts {
  agent1: string;
  agent2: string;
  agent3: string;
  agent4: string;
}

interface AppContextType {
  companySettings: CompanySettings;
  setCompanySettings: React.Dispatch<React.SetStateAction<CompanySettings>>;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  prompts: AgentPrompts;
  setPrompts: React.Dispatch<React.SetStateAction<AgentPrompts>>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addLead: (lead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>) => void;
  storageState: 'loading' | 'ready' | 'saving' | 'error' | 'unconfigured';
  storageError: string | null;
}

const defaultCompanySettings: CompanySettings = {
  companyName: 'RoofFlow AI Roofing',
  city: 'Dallas-Fort Worth',
  stormName: 'Great Hailstorm of 2026',
  stormDate: 'May 15, 2026',
  financingOptions: '0% APR for 12 months, or low-interest plans starting at $99/mo',
  agentTone: 'Professional, reassuring, hazard-focused, and highly helpful',
};

const defaultPrompts: AgentPrompts = {
  agent1: `You are the Website Lead Capture Chatbot for {{companyName}} in {{city}}.
Your goals:
1. Capture the homeowner's Name, Phone, and Email.
2. Confirm they are the homeowner (Property Ownership = Owner).
3. Handle storm/objection inquiries about recent {{stormName}} on {{stormDate}}.
4. Schedule a FREE professional roof health inspection.`,
  agent2: `You are the Interactive Phone Voice Assistant.
Your goals:
1. Greet callers warmly with a professional corporate roofing tone.
2. Quickly qualify if they have active storm damage from {{stormName}} in {{city}}.
3. Offer financing options: {{financingOptions}}.
4. Secure a scheduled time for an inspection.`,
  agent3: `You are the SMS/Email Follow-Up & Nurture Agent.
Your goals:
1. Reactivate cold leads that filled out forms but did not book an inspection.
2. Reference local hail events and urgent storm inspection deadlines.
3. Keep the conversation conversational, low-pressure but urgent.`,
  agent4: `You are the Estimate Follow-Up Agent.
Your goals:
1. Follow up with homeowners within 24h/3d/7d of receiving a repair estimate.
2. Address typical contractor objections (e.g., insurance claim delays, financing, budget, competitor price matching).
3. Offer low-interest payment terms: {{financingOptions}}.`
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isEmailVerified } = useAuth();
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [leads, setLeadsState] = useState<Lead[]>([]);
  const [prompts, setPrompts] = useState<AgentPrompts>(defaultPrompts);
  const [activeTab, setActiveTab] = useState<string>('agent1');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageState, setStorageState] = useState<AppContextType['storageState']>('loading');
  const [storageError, setStorageError] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const skipProfileWriteRef = useRef(false);
  const previousLeadsRef = useRef<Lead[]>([]);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!supabase || !user || !isEmailVerified) {
      hydratedRef.current = false;
      setHydrated(false);
      setTenantId(null);
      setLeadsState([]);
      previousLeadsRef.current = [];
      setCompanySettings(defaultCompanySettings);
      setPrompts(defaultPrompts);
      setStorageError(null);
      setStorageState(supabase ? 'ready' : 'unconfigured');
      return;
    }

    let cancelled = false;
    hydratedRef.current = false;
    setHydrated(false);
    setStorageState('loading');
    setStorageError(null);

    void (async () => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id, company_settings, agent_prompts')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileError) throw new Error('Your workspace profile could not be loaded. Apply supabase/auth-crm.sql and try again.');
      if (!profile?.tenant_id) throw new Error('Your workspace has not been created yet. Apply supabase/auth-crm.sql and sign in again.');

      const { data: rows, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (leadsError) throw new Error('CRM data could not be loaded. Check the Supabase schema and row security policies.');
      if (cancelled) return;

      const loadedLeads = (rows ?? []).map(mapLeadFromRow);
      setTenantId(profile.tenant_id);
      setLeadsState(loadedLeads);
      previousLeadsRef.current = loadedLeads;
      skipProfileWriteRef.current = true;
      setCompanySettings({ ...defaultCompanySettings, ...(profile.company_settings ?? {}) });
      setPrompts({ ...defaultPrompts, ...(profile.agent_prompts ?? {}) });
      hydratedRef.current = true;
      setHydrated(true);
      setStorageState('ready');
    })().catch((error: unknown) => {
      if (cancelled) return;
      setStorageState('error');
      setStorageError(error instanceof Error ? error.message : 'Supabase data could not be loaded.');
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, isEmailVerified]);

  const setLeads: React.Dispatch<React.SetStateAction<Lead[]>> = useCallback((next) => {
    setLeadsState((current) => typeof next === 'function' ? next(current) : next);
  }, []);

  useEffect(() => {
    if (!hydrated || !supabase || !tenantId) return;
    const previous = previousLeadsRef.current;
    previousLeadsRef.current = leads;

    const nextById = new Map(leads.map((lead) => [lead.id, lead]));
    const previousById = new Map(previous.map((lead) => [lead.id, lead]));
    const deletedIds = previous.filter((lead) => !nextById.has(lead.id)).map((lead) => lead.id);
    const changed = leads.filter((lead) => JSON.stringify(previousById.get(lead.id)) !== JSON.stringify(lead));
    if (!deletedIds.length && !changed.length) return;

    setStorageState('saving');
    setStorageError(null);
    const supabaseClient = supabase;
    const currentTenant = tenantId;
    writeQueueRef.current = writeQueueRef.current.catch(() => undefined).then(async () => {
      if (deletedIds.length) {
        const { error } = await supabaseClient.from('leads').delete().in('id', deletedIds).eq('tenant_id', currentTenant);
        if (error) throw error;
      }
      if (changed.length) {
        const { error } = await supabaseClient.from('leads').upsert(
          changed.map((lead) => mapLeadToRow(lead, currentTenant)),
          { onConflict: 'id' },
        );
        if (error) throw error;
      }
      setStorageState('ready');
    }).catch((error: unknown) => {
      setStorageState('error');
      setStorageError(error instanceof Error ? error.message : 'CRM changes could not be saved.');
    });
  }, [leads, tenantId, hydrated]);

  useEffect(() => {
    if (!hydrated || !supabase || !user) return;
    if (skipProfileWriteRef.current) {
      skipProfileWriteRef.current = false;
      return;
    }
    void supabase.from('profiles')
      .update({ company_settings: companySettings, agent_prompts: prompts })
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          setStorageState('error');
          setStorageError('Workspace settings could not be saved. Check your Supabase profile permissions.');
        }
      });
  }, [companySettings, prompts, hydrated, user?.id]);

  const addLead = (newLead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>) => {
    const leadWithId: Lead = {
      id: crypto.randomUUID(),
      name: newLead.name,
      phone: newLead.phone,
      email: newLead.email || 'N/A',
      propertyOwnership: newLead.propertyOwnership || 'Owner',
      status: newLead.status || 'New Lead',
      scheduledDate: newLead.scheduledDate || '',
      appointmentDetails: newLead.appointmentDetails || (newLead.scheduledDate ? {
        date: newLead.scheduledDate.split(' ')[0],
        time: newLead.scheduledDate.split(' ').slice(1).join(' '),
        notes: 'Captured by conversational assistant.'
      } : undefined),
      zipCode: newLead.zipCode || 'N/A',
      roofIssue: newLead.roofIssue || 'Storm damage assessment',
      agentType: newLead.agentType || 'Chatbot',
      chatLog: newLead.chatLog || [
        { sender: 'System', text: `Lead initialized via ${newLead.agentType || 'Chatbot'}.`, timestamp: new Date().toLocaleString() }
      ],
    };
    setLeads([leadWithId, ...leads]);
  };

  return (
    <AppContext.Provider value={{
      companySettings,
      setCompanySettings,
      leads,
      setLeads,
      prompts,
      setPrompts,
      activeTab,
      setActiveTab,
      addLead,
      storageState,
      storageError,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

function mapLeadFromRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    propertyOwnership: row.property_ownership === 'Renter' ? 'Renter' : 'Owner',
    status: (row.status as Lead['status']) || 'New Lead',
    scheduledDate: typeof row.scheduled_date === 'string' ? row.scheduled_date : undefined,
    calendarEventId: typeof row.calendar_event_id === 'string' ? row.calendar_event_id : undefined,
    appointmentDetails: row.appointment_details && typeof row.appointment_details === 'object'
      ? row.appointment_details as Lead['appointmentDetails']
      : undefined,
    zipCode: String(row.zip_code ?? ''),
    roofIssue: String(row.roof_issue ?? ''),
    agentType: (row.agent_type as Lead['agentType']) || 'Chatbot',
    chatLog: Array.isArray(row.chat_log) ? row.chat_log as Lead['chatLog'] : [],
  };
}

function mapLeadToRow(lead: Lead, tenantId: string) {
  return {
    id: lead.id,
    tenant_id: tenantId,
    name: lead.name,
    phone: lead.phone,
    email: lead.email || null,
    property_ownership: lead.propertyOwnership,
    status: lead.status,
    scheduled_date: lead.scheduledDate || null,
    calendar_event_id: lead.calendarEventId || null,
    appointment_details: lead.appointmentDetails ?? null,
    zip_code: lead.zipCode || null,
    roof_issue: lead.roofIssue || null,
    agent_type: lead.agentType,
    chat_log: lead.chatLog,
    updated_at: new Date().toISOString(),
  };
}
