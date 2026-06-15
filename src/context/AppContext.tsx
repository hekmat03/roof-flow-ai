import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyOwnership: 'Owner' | 'Renter';
  status: 'New Lead' | 'In Contact' | 'Inspection Scheduled' | 'Follow-up Nurture' | 'Closed';
  scheduledDate?: string;
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
  addLead: (lead: Omit<Lead, 'id'>) => void;
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

const defaultLeads: Lead[] = [
  {
    id: '1',
    name: 'Sarah Jenkins',
    phone: '(214) 555-0198',
    email: 'sarah.j@gmail.com',
    propertyOwnership: 'Owner',
    status: 'Inspection Scheduled',
    scheduledDate: '2026-06-20 10:00 AM',
    agentType: 'Chatbot',
    chatLog: [
      { sender: 'AI', text: 'Hello! I am your AI Roof assistant. Are you seeing any leaks or missing shingles from the recent hailstorm?', timestamp: '2026-06-14 10:01 AM' },
      { sender: 'User', text: 'Yes, our roof was hit bad during the Great Hailstorm of 2026 last month.', timestamp: '2026-06-14 10:02 AM' },
      { sender: 'AI', text: 'I am so sorry to hear that. I can get a specialist out to inspect it for free. Are you the homeowner?', timestamp: '2026-06-14 10:02 AM' },
      { sender: 'User', text: 'Yes, I own the home. Let’s do it.', timestamp: '2026-06-14 10:03 AM' },
      { sender: 'AI', text: 'Perfect! Can I get your email and phone to confirm?', timestamp: '2026-06-14 10:03 AM' },
      { sender: 'User', text: 'sarah.j@gmail.com, 214-555-0198', timestamp: '2026-06-14 10:04 AM' },
      { sender: 'AI', text: 'Got it! I have scheduled your free inspection for June 20 at 10:00 AM. Thank you!', timestamp: '2026-06-14 10:04 AM' },
    ]
  },
  {
    id: '2',
    name: 'Michael Miller',
    phone: '(817) 555-3811',
    email: 'm.miller@yahoo.com',
    propertyOwnership: 'Owner',
    status: 'Follow-up Nurture',
    agentType: 'SMS Nurture',
    chatLog: [
      { sender: 'System', text: 'Lead imported from website inquiry.', timestamp: '2026-06-12 09:00 AM' },
      { sender: 'AI', text: '[SMS Day 1] Hi Michael, this is RoofFlow AI. We saw you requested a roof inspection but haven’t scheduled it yet. The recent hailstorm damage might lead to leaks if unaddressed. Do you have 5 minutes this week?', timestamp: '2026-06-13 11:00 AM' },
      { sender: 'User', text: 'Is it really free? No strings attached?', timestamp: '2026-06-13 01:15 PM' },
      { sender: 'AI', text: '[SMS AI Agent] Absolutely 100% free with no obligation. We provide a full digital photo report for your records or insurance. Should we set it up?', timestamp: '2026-06-13 01:17 PM' }
    ]
  }
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => {
    const saved = localStorage.getItem('companySettings');
    return saved ? JSON.parse(saved) : defaultCompanySettings;
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('leads');
    return saved ? JSON.parse(saved) : defaultLeads;
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

  const addLead = (newLead: Omit<Lead, 'id'>) => {
    const leadWithId: Lead = {
      ...newLead,
      id: Math.random().toString(36).substr(2, 9),
    };
    setLeads((prev) => [leadWithId, ...prev]);
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
