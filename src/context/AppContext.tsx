
import React, { createContext, useContext, useState, useEffect } from 'react';
import { postLeadToWebhook } from '../utils/webhook';

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

/**
 * Live CRM only — no mock/seed leads. A fresh browser starts with 0 leads and
 * every lead in the board comes from a real simulator capture.
 */
const defaultLeads: Lead[] = [];

/**
 * Leads storage schema version. v1 (absent key) shipped with hardcoded demo
 * leads that got persisted into localStorage; v2 discards any legacy stored
 * array exactly once so even browsers that ran the old demo (including the
 * owner's) start from a clean, live-data-only CRM. Captured leads made AFTER
 * the v2 marker is set persist normally.
 */
const LEADS_SCHEMA_V = '2';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => {
    const saved = localStorage.getItem('companySettings');
    return saved ? JSON.parse(saved) : defaultCompanySettings;
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const schemaV = localStorage.getItem('leads_schema_v');
      if (schemaV !== LEADS_SCHEMA_V) {
        // One-time migration: the stored array predates live-data-only mode
        // (it contains the old demo leads). Discard it and mark v2.
        localStorage.setItem('leads_schema_v', LEADS_SCHEMA_V);
        localStorage.removeItem('leads');
        return [];
      }
      const saved = localStorage.getItem('leads');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [prompts, setPrompts] = useState<AgentPrompts>(() => {
    const saved = localStorage.getItem('prompts');
    return saved ? JSON.parse(saved) : defaultPrompts;
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');

  useEffect(() => {
    localStorage.setItem('companySettings', JSON.stringify(companySettings));
  }, [companySettings]);

  useEffect(() => {
    localStorage.setItem('leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('prompts', JSON.stringify(prompts));
  }, [prompts]);

  const addLead = (newLead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>) => {
    const leadWithId: Lead = {
      id: Math.random().toString(36).substr(2, 9),
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
    setLeads((prev) => [leadWithId, ...prev]);

    // Real CRM push: fire-and-forget POST to the configured Google Sheets
    // webhook (no-op when the URL isn't set in Configuration). The internal
    // CRM board above updates instantly regardless — the webhook must never
    // block or break lead capture.
    postLeadToWebhook({
      name: leadWithId.name,
      phone: leadWithId.phone,
      email: leadWithId.email,
      zip: leadWithId.zipCode,
      roofIssue: leadWithId.roofIssue,
      status: leadWithId.status,
      source: leadWithId.agentType,
      timestamp: new Date().toISOString(),
    }).catch(() => { /* postLeadToWebhook never rejects, belt-and-suspenders */ });
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
      addLead
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
