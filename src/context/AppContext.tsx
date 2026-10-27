import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { postLeadToWebhook } from '../utils/webhook';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { defaultTabForPlan, featureAllowed, normalizePlan, tabToFeature, type PlanId } from '../lib/planAccess';
import { isValidEmail, isValidPhone } from '../lib/contactValidation';
import type { User } from '@supabase/supabase-js';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyOwnership: 'Owner' | 'Renter';
  status: 'New Lead' | 'Contacted' | 'In Contact' | 'Inspection Scheduled' | 'Inspection Completed' | 'Estimate Sent' | 'Closed-Won' | 'Closed-Lost' | 'Follow-up Nurture' | 'Closed';
  scheduledDate?: string;
  appointmentDetails?: {
    date: string;
    time: string;
    notes?: string;
  };
  zipCode: string;
  roofIssue: string;
  agentType: 'Chatbot' | 'Phone Call' | 'SMS Nurture' | 'Estimate Follow-Up';
  chatLog: Array<{ sender: 'User' | 'AI' | 'System'; text: string; timestamp: string }>;
  createdAt?: string;
  tenantId?: string;
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

export interface TenantInfo {
  id: string;
  name: string;
  currentPlan: PlanId;
  chatsUsed: number;
  chatsPeriodStart: string | null;
  googleCalendarEmail: string | null;
  webhookUrl: string | null;
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
  user: User | null;
  emailVerified: boolean;
  authLoading: boolean;
  tenant: TenantInfo | null;
  plan: PlanId;
  chatsLimit: number;
  chatsUsed: number;
  consumeChat: (conversationId: string) => Promise<{ ok: boolean; remaining: number; error?: string }>;
  refreshTenant: () => Promise<void>;
  signOut: () => Promise<void>;
  upgradeOpen: boolean;
  upgradeFeature: string;
  openUpgrade: (featureLabel: string) => void;
  closeUpgrade: () => void;
  requestTab: (tab: string) => void;
  supabaseReady: boolean;
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

interface LeadRow {
  id: string;
  tenant_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  zip?: string | null;
  zip_code?: string | null;
  roof_issue?: string | null;
  status?: string | null;
  property_ownership?: string | null;
  scheduled_date?: string | null;
  appointment_details?: Lead['appointmentDetails'] | null;
  agent_type?: string | null;
  chat_log?: Lead['chatLog'] | null;
  conversation?: Lead['chatLog'] | null;
  created_at?: string | null;
}

function rowToLead(row: LeadRow): Lead {
  const ownership = row.property_ownership === 'Renter' ? 'Renter' : 'Owner';
  const agent = (row.agent_type as Lead['agentType']) || 'Chatbot';
  return {
    id: row.id,
    name: row.name || 'Unknown',
    phone: row.phone || '',
    email: row.email || '',
    propertyOwnership: ownership,
    status: (row.status as Lead['status']) || 'New Lead',
    scheduledDate: row.scheduled_date || '',
    appointmentDetails: row.appointment_details || undefined,
    zipCode: row.zip_code || row.zip || 'N/A',
    roofIssue: row.roof_issue || 'Storm damage assessment',
    agentType: agent,
    chatLog: row.chat_log || row.conversation || [],
    createdAt: row.created_at || undefined,
    tenantId: row.tenant_id || undefined,
  };
}

function leadToRow(lead: Lead, tenantId: string) {
  return {
    id: lead.id,
    tenant_id: tenantId,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    zip: lead.zipCode,
    zip_code: lead.zipCode,
    roof_issue: lead.roofIssue,
    status: lead.status,
    property_ownership: lead.propertyOwnership,
    scheduled_date: lead.scheduledDate || null,
    appointment_details: lead.appointmentDetails || null,
    agent_type: lead.agentType,
    chat_log: lead.chatLog,
    conversation: lead.chatLog,
    contact_key: lead.phone || lead.email || lead.id,
    updated_at: new Date().toISOString(),
  };
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `l${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [leads, setLeadsState] = useState<Lead[]>([]);
  const [prompts, setPrompts] = useState<AgentPrompts>(defaultPrompts);
  const [activeTab, setActiveTabState] = useState<string>('agent1');
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState('This feature');
  const leadsRef = useRef<Lead[]>([]);
  leadsRef.current = leads;

  const plan: PlanId = tenant?.currentPlan ?? 'free';
  const emailVerified = Boolean(user?.email_confirmed_at);
  const chatsLimit = plan === 'pro' ? 1000 : plan === 'starter' ? 250 : 20;

  const refreshTenant = useCallback(async () => {
    if (!supabase || !user) {
      setTenant(null);
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, current_plan, email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile?.tenant_id) {
      setTenant(null);
      return;
    }
    const { data: t } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', profile.tenant_id)
      .maybeSingle();
    if (!t) {
      setTenant(null);
      return;
    }
    const nextPlan = normalizePlan(t.current_plan ?? profile.current_plan);
    setTenant({
      id: t.id,
      name: t.name || 'My Roofing Company',
      currentPlan: nextPlan,
      chatsUsed: Number(t.chats_used ?? 0),
      chatsPeriodStart: t.chats_period_start ?? null,
      googleCalendarEmail: t.google_calendar_email ?? null,
      webhookUrl: t.webhook_url ?? null,
    });
    if (t.company_settings && typeof t.company_settings === 'object') {
      setCompanySettings({ ...defaultCompanySettings, ...(t.company_settings as CompanySettings) });
    }
    if (t.prompts && typeof t.prompts === 'object') {
      setPrompts({ ...defaultPrompts, ...(t.prompts as AgentPrompts) });
    }
  }, [user]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshTenant();
  }, [refreshTenant]);

  useEffect(() => {
    if (!supabase || !tenant?.id) {
      setLeadsState([]);
      return;
    }
    let alive = true;
    void supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.warn('Could not load leads', error.message);
          return;
        }
        setLeadsState((data as LeadRow[] | null)?.map(rowToLead) ?? []);
      });
    return () => {
      alive = false;
    };
  }, [tenant?.id]);

  useEffect(() => {
    if (!user) return;
    setActiveTabState(defaultTabForPlan(plan));
  }, [user, plan]);

  const persistSettings = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!supabase || !tenant?.id) return;
    window.clearTimeout(persistSettings.current);
    persistSettings.current = window.setTimeout(() => {
      void supabase.from('tenants').update({
        company_settings: companySettings,
        prompts,
        name: companySettings.companyName,
      }).eq('id', tenant.id);
    }, 400);
  }, [companySettings, prompts, tenant?.id]);

  const persistLeads = useRef<number | undefined>(undefined);
  const setLeads: React.Dispatch<React.SetStateAction<Lead[]>> = (action) => {
    setLeadsState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (supabase && tenant?.id) {
        const snapshot = prev;
        const tid = tenant.id;
        window.clearTimeout(persistLeads.current);
        persistLeads.current = window.setTimeout(() => {
          const prevMap = new Map(snapshot.map((l) => [l.id, l]));
          const nextIds = new Set(next.map((l) => l.id));
          const removed = [...prevMap.keys()].filter((id) => !nextIds.has(id));
          if (removed.length) {
            void supabase.from('leads').delete().in('id', removed).eq('tenant_id', tid);
          }
          const changed = next.filter((l) => JSON.stringify(prevMap.get(l.id)) !== JSON.stringify(l));
          if (changed.length) {
            void supabase.from('leads').upsert(changed.map((l) => leadToRow(l, tid)));
          }
        }, 250);
      }
      return next;
    });
  };

  const addLead = (newLead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>) => {
    if (newLead.email && newLead.email !== 'N/A' && !isValidEmail(newLead.email)) return;
    if (newLead.phone && !isValidPhone(newLead.phone)) return;

    const leadWithId: Lead = {
      id: newId(),
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
      createdAt: new Date().toISOString(),
      tenantId: tenant?.id,
    };
    setLeads((prev) => [leadWithId, ...prev]);

    postLeadToWebhook({
      name: leadWithId.name,
      phone: leadWithId.phone,
      email: leadWithId.email,
      zip: leadWithId.zipCode,
      roofIssue: leadWithId.roofIssue,
      status: leadWithId.status,
      source: leadWithId.agentType,
      timestamp: new Date().toISOString(),
    }).catch(() => { /* postLeadToWebhook never rejects */ });

    if (leadWithId.status === 'Inspection Scheduled' && supabase) {
      void supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        return fetch('/api/google-calendar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            lead: {
              name: leadWithId.name,
              phone: leadWithId.phone,
              email: leadWithId.email,
              zipCode: leadWithId.zipCode,
              roofIssue: leadWithId.roofIssue,
            },
            scheduledDate: leadWithId.scheduledDate,
            appointmentDetails: leadWithId.appointmentDetails,
          }),
        });
      }).catch(() => { /* calendar is optional */ });
    }
  };

  const consumeChat = async (conversationId: string) => {
    if (!supabase || !user) {
      return { ok: true, remaining: chatsLimit };
    }
    const { data, error } = await supabase.rpc('consume_chat', { p_conversation_id: conversationId });
    if (error) {
      return { ok: true, remaining: Math.max(chatsLimit - (tenant?.chatsUsed ?? 0), 0), error: error.message };
    }
    const payload = (data ?? {}) as { ok?: boolean; remaining?: number; used?: number; error?: string };
    if (typeof payload.used === 'number') {
      setTenant((prev) => prev ? { ...prev, chatsUsed: payload.used as number } : prev);
    }
    return {
      ok: payload.ok !== false,
      remaining: Number(payload.remaining ?? 0),
      error: payload.error,
    };
  };

  const openUpgrade = (featureLabel: string) => {
    setUpgradeFeature(featureLabel);
    setUpgradeOpen(true);
  };
  const closeUpgrade = () => setUpgradeOpen(false);

  const requestTab = (tab: string) => {
    const feature = tabToFeature(tab);
    if (!featureAllowed(plan, feature)) {
      const labels: Record<string, string> = {
        dashboard: 'Analytics Dashboard',
        crm: 'CRM Board',
        agent2: 'Agent 2: Phone Call',
        agent3: 'Agent 3: SMS & Email',
        agent4: 'Agent 4: Estimate Follow-up',
      };
      openUpgrade(labels[tab] || 'This feature');
      return;
    }
    setActiveTabState(tab);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setTenant(null);
    setLeadsState([]);
    setUser(null);
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
      setActiveTab: requestTab,
      addLead,
      user,
      emailVerified,
      authLoading,
      tenant,
      plan,
      chatsLimit,
      chatsUsed: tenant?.chatsUsed ?? 0,
      consumeChat,
      refreshTenant,
      signOut,
      upgradeOpen,
      upgradeFeature,
      openUpgrade,
      closeUpgrade,
      requestTab,
      supabaseReady: supabaseConfigured,
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
