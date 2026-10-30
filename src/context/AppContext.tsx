
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { postLeadToWebhook } from '../utils/webhook';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  fetchLeads, upsertLeads, deleteLeads, fetchMyTenantId, fetchTenantConfig, saveTenantConfig,
} from '../lib/leadsDb';
import { validateEmail, validateName, validatePhone, formatPhone } from '../lib/validators';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyOwnership: 'Owner' | 'Renter';
  status: 'New Lead' | 'Contacted' | 'In Contact' | 'Inspection Scheduled' | 'Inspection Completed' | 'Estimate Sent' | 'Closed-Won' | 'Closed-Lost' | 'Follow-up Nurture' | 'Closed';
  scheduledDate?: string;
  appointmentDetails?: { date: string; time: string; notes?: string };
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
  addLead: (lead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>, options?: { validate?: boolean }) => AddLeadResult;
  tenantId: string | null;
  storageStatus: StorageStatus;
  storageError: string | null;
}

export interface AddLeadErrors { name?: string; phone?: string; email?: string }
export type AddLeadResult = { ok: true; lead: Lead } | { ok: false; errors: AddLeadErrors };
export type StorageStatus = 'loading' | 'ready' | 'signed-out' | 'unconfigured' | 'error';

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
const SAVE_DEBOUNCE_MS = 800;

function leadChanged(a: Lead, b: Lead): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [prompts, setPrompts] = useState<AgentPrompts>(defaultPrompts);
  const [leads, setLeadsState] = useState<Lead[]>([]);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(supabase ? 'loading' : 'unconfigured');
  const [storageError, setStorageError] = useState<string | null>(null);

  const leadsRef = useRef<Lead[]>([]);
  const tenantRef = useRef<string | null>(null);
  const configLoaded = useRef(false);

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Storage request failed.';
    setStorageError(msg);
  }, []);

  const loadTenant = useCallback(async () => {
    if (!supabase) return;
    configLoaded.current = false;
    try {
      const id = await fetchMyTenantId();
      tenantRef.current = id;
      setTenantId(id);
      if (!id) {
        leadsRef.current = [];
        setLeadsState([]);
        setStorageStatus('signed-out');
        return;
      }
      const [cfg, rows] = await Promise.all([fetchTenantConfig(id), fetchLeads(id)]);
      setCompanySettings({ ...defaultCompanySettings, ...cfg.settings });
      setPrompts({ ...defaultPrompts, ...cfg.prompts });
      leadsRef.current = rows;
      setLeadsState(rows);
      configLoaded.current = true;
      setStorageError(null);
      setStorageStatus('ready');
    } catch (e) {
      fail(e);
      setStorageStatus('error');
    }
  }, [fail]);

  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    if (!userId) {
      tenantRef.current = null;
      configLoaded.current = false;
      leadsRef.current = [];
      setTenantId(null);
      setLeadsState([]);
      setStorageStatus('signed-out');
      return;
    }
    setStorageStatus('loading');
    void loadTenant();
  }, [userId, loadTenant]);

  useEffect(() => {
    if (!configLoaded.current || !tenantRef.current) return;
    const id = tenantRef.current;
    const t = setTimeout(() => {
      saveTenantConfig(id, companySettings, prompts).catch(fail);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [companySettings, prompts, fail]);

  const setLeads: React.Dispatch<React.SetStateAction<Lead[]>> = useCallback((action) => {
    const prev = leadsRef.current;
    const next = typeof action === 'function' ? action(prev) : action;
    leadsRef.current = next;
    setLeadsState(next);

    const id = tenantRef.current;
    if (!id) return;

    const prevById = new Map(prev.map((l) => [l.id, l]));
    const nextIds = new Set(next.map((l) => l.id));
    const changed = next.filter((l) => {
      const old = prevById.get(l.id);
      return !old || leadChanged(old, l);
    });
    const removed = prev.filter((l) => !nextIds.has(l.id)).map((l) => l.id);

    Promise.all([upsertLeads(id, changed), deleteLeads(id, removed)]).catch((e) => {
      fail(e);
      void fetchLeads(id).then((rows) => {
        leadsRef.current = rows;
        setLeadsState(rows);
      }).catch(() => {});
    });
  }, [fail]);

  const addLead = (
    newLead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>,
    options?: { validate?: boolean },
  ): AddLeadResult => {
    let name = newLead.name;
    let phone = newLead.phone;
    let email = newLead.email || 'N/A';

    if (options?.validate) {
      const errors: AddLeadErrors = {};
      const n = validateName(newLead.name);
      const p = validatePhone(newLead.phone);
      if (n.ok) name = n.value; else errors.name = n.error;
      if (p.ok) phone = formatPhone(p.value); else errors.phone = p.error;
      const rawEmail = (newLead.email ?? '').trim();
      if (rawEmail && rawEmail.toUpperCase() !== 'N/A') {
        const e = validateEmail(rawEmail);
        if (e.ok) email = e.value; else errors.email = e.error;
      }
      if (errors.name || errors.phone || errors.email) return { ok: false, errors };
    }

    const leadWithId: Lead = {
      id: crypto.randomUUID(),
      name,
      phone,
      email,
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
    }).catch(() => {});

    return { ok: true, lead: leadWithId };
  };

  return (
    <AppContext.Provider value={{
      companySettings, setCompanySettings,
      leads, setLeads,
      prompts, setPrompts,
      activeTab, setActiveTab,
      addLead,
      tenantId, storageStatus, storageError,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
