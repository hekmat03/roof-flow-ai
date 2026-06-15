import React, { createContext, useContext, useState, useEffect } from 'react';

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

const defaultLeads: Lead[] = [
  {
    id: '1',
    name: 'Sarah Jenkins',
    phone: '(214) 555-0198',
    email: 'sarah.j@gmail.com',
    propertyOwnership: 'Owner',
    status: 'Inspection Scheduled',
    scheduledDate: '2026-06-20 10:00 AM',
    appointmentDetails: {
      date: '2026-06-20',
      time: '10:00 AM',
      notes: 'Visible denting on gutters and asphalt shingles from severe hail.'
    },
    zipCode: '75201',
    roofIssue: 'Great Hailstorm of 2026 Hail Damage',
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
    zipCode: '76102',
    roofIssue: 'Minor Ceiling Leak & Wind Damage',
    agentType: 'SMS Nurture' as any, // 'SMS Nurture' maps to 'SMS Nurture' or 'SMS/Email Nurture' etc but here we use the lead AgentType
    chatLog: [
      { sender: 'System', text: 'Lead imported from website inquiry.', timestamp: '2026-06-12 09:00 AM' },
      { sender: 'AI', text: '[SMS Day 1] Hi Michael, this is RoofFlow AI. We saw you requested a roof inspection but haven’t scheduled it yet. The recent hailstorm damage might lead to leaks if unaddressed. Do you have 5 minutes this week?', timestamp: '2026-06-13 11:00 AM' },
      { sender: 'User', text: 'Is it really free? No strings attached?', timestamp: '2026-06-13 01:15 PM' },
      { sender: 'AI', text: '[SMS AI Agent] Absolutely 100% free with no obligation. We provide a full digital photo report for your records or insurance. Should we set it up?', timestamp: '2026-06-13 01:17 PM' }
    ]
  },
  {
    id: '3',
    name: 'David Vance',
    phone: '(214) 555-7281',
    email: 'dvance@gmail.com',
    propertyOwnership: 'Owner',
    status: 'Inspection Completed',
    scheduledDate: '2026-06-12 02:00 PM',
    appointmentDetails: {
      date: '2026-06-12',
      time: '02:00 PM',
      notes: 'Completed free inspection. Extensive hail impact craters found across north-facing slope. Claim filed with State Farm, pending adjuster review.'
    },
    zipCode: '75019',
    roofIssue: 'Hail Damage Claim Pending',
    agentType: 'Phone Call',
    chatLog: [
      { sender: 'AI', text: 'Thank you for calling RoofFlow Claim Support! This is our AI Voice Assistant. Are you calling about a roof inspection?', timestamp: '2026-06-11 02:05 PM' },
      { sender: 'User', text: 'Yes, we had some major hail last month and State Farm wants an inspection report.', timestamp: '2026-06-11 02:06 PM' },
      { sender: 'AI', text: 'We can certainly do that! We have direct experience with State Farm claims in Dallas. Are you the homeowner?', timestamp: '2026-06-11 02:06 PM' },
      { sender: 'User', text: 'Yes, I am the owner, David Vance.', timestamp: '2026-06-11 02:07 PM' },
      { sender: 'AI', text: 'Excellent, David. Let’s book the free inspection for tomorrow at 2:00 PM.', timestamp: '2026-06-11 02:07 PM' },
      { sender: 'System', text: 'Appointment booked and logged to CRM.', timestamp: '2026-06-11 02:08 PM' }
    ]
  },
  {
    id: '4',
    name: 'Amanda Rollins',
    phone: '(972) 555-4920',
    email: 'amanda.rollins@outlook.com',
    propertyOwnership: 'Owner',
    status: 'Estimate Sent',
    scheduledDate: '2026-06-13 11:30 AM',
    appointmentDetails: {
      date: '2026-06-13',
      time: '11:30 AM',
      notes: 'Inspection completed, full replacement estimate of $14,800 sent to insurance and owner.'
    },
    zipCode: '75039',
    roofIssue: 'Full Roof Replacement Estimate Sent',
    agentType: 'Estimate Follow-Up',
    chatLog: [
      { sender: 'System', text: 'Lead imported from inspection report.', timestamp: '2026-06-13 12:00 PM' },
      { sender: 'AI', text: 'Hi Amanda, this is RoofFlow AI estimate follower. Did you receive the replacement estimate of $14,800 for your roof?', timestamp: '2026-06-13 04:00 PM' },
      { sender: 'User', text: 'Yes I did. I am just waiting on the deductible check from my insurance company.', timestamp: '2026-06-13 04:15 PM' },
      { sender: 'AI', text: 'Understandable! We work directly with your insurer to align payment schedules. We also offer 0% APR financing options if needed. Let us know when the check arrives!', timestamp: '2026-06-13 04:17 PM' }
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
      zipCode: newLead.zipCode || '75201',
      roofIssue: newLead.roofIssue || 'Storm damage assessment',
      agentType: newLead.agentType || 'Chatbot',
      chatLog: newLead.chatLog || [
        { sender: 'System', text: `Lead initialized via ${newLead.agentType || 'Chatbot'}.`, timestamp: new Date().toLocaleString() }
      ],
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
