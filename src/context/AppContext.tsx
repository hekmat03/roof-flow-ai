import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { postLeadToWebhook } from '../utils/webhook';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  fetchLeads, upsertLeads, deleteLeads, fetchMyTenantId, fetchTenantConfig, saveTenantConfig,
  fetchUserCompanies, DEFAULT_COMPANIES, ABC_ROOFING_TENANT_ID, XYZ_ROOFING_TENANT_ID,
  type CompanyInfo,
} from '../lib/leadsDb';
import { validateEmail, validateName, validatePhone, formatPhone } from '../lib/validators';
import { EMPTY_COMPANY_SETTINGS, settingsForTenant } from '../lib/companySettings';

export interface PurchaseRecord {
  id: string;
  item: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Pending' | 'Refunded';
  invoiceNumber?: string;
}

export type CustomerStatus = 'Lead' | 'Active Customer' | 'Past Customer' | 'VIP' | 'Churned';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  customerStatus?: CustomerStatus;
  propertyOwnership: 'Owner' | 'Renter';
  status: 'New Lead' | 'Contacted' | 'In Contact' | 'Inspection Scheduled' | 'Inspection Completed' | 'Estimate Sent' | 'Closed-Won' | 'Closed-Lost' | 'Follow-up Nurture' | 'Closed';
  scheduledDate?: string;
  appointmentDetails?: {
    date: string;
    time: string;
    notes?: string;
    calendarEventId?: string;
  };
  zipCode: string;
  roofIssue: string;
  agentType: 'Chatbot' | 'Phone Call' | 'SMS Nurture' | 'Estimate Follow-Up';
  chatLog: Array<{ sender: 'User' | 'AI' | 'System'; text: string; timestamp: string }>;
  purchaseHistory: PurchaseRecord[];
}

export interface CompanySettings {
  companyName: string;
  city: string;
  stormName: string;
  stormDate: string;
  financingOptions: string;
  agentTone: string;
}

export interface AppContextType {
  companySettings: CompanySettings;
  setCompanySettings: React.Dispatch<React.SetStateAction<CompanySettings>>;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addLead: (
    lead: Partial<Omit<Lead, 'id'>> & Pick<Lead, 'name' | 'phone'>,
    options?: { validate?: boolean },
  ) => AddLeadResult;
  tenantId: string | null;
  availableCompanies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  switchCompany: (newTenantId: string) => Promise<void>;
  storageStatus: StorageStatus;
  storageError: string | null;
  refreshTenant: () => Promise<void>;
}

export interface AddLeadErrors { name?: string; phone?: string; email?: string }
export type AddLeadResult = { ok: true; lead: Lead } | { ok: false; errors: AddLeadErrors };

export type StorageStatus = 'loading' | 'ready' | 'signed-out' | 'unconfigured' | 'error';

const defaultCompanySettings = EMPTY_COMPANY_SETTINGS;

const INITIAL_DEMO_LEADS_ABC: Lead[] = [
  {
    id: 'lead-abc-001',
    name: 'Michael Smith',
    phone: '(214) 555-0199',
    email: 'michael.smith@gmail.com',
    customerStatus: 'Active Customer',
    propertyOwnership: 'Owner',
    status: 'Estimate Sent',
    scheduledDate: '2026-11-12 10:00 AM',
    appointmentDetails: {
      date: '2026-11-12',
      time: '10:00 AM',
      notes: 'Hail inspection on composition asphalt shingles.',
    },
    zipCode: '75201',
    roofIssue: 'Severe hail damage and missing ridge shingles',
    agentType: 'Chatbot',
    chatLog: [
      { sender: 'User', text: 'Hello, our roof started leaking around the chimney after the hail storm yesterday.', timestamp: '2026-11-08 09:14 AM' },
      { sender: 'AI', text: 'We are sorry to hear that, Michael. We have licensed emergency inspection crews in Dallas right now. Let us book an immediate inspection.', timestamp: '2026-11-08 09:15 AM' },
      { sender: 'User', text: 'Tomorrow morning works great.', timestamp: '2026-11-08 09:16 AM' },
      { sender: 'System', text: 'Inspection scheduled for 2026-11-12 10:00 AM', timestamp: '2026-11-08 09:17 AM' },
    ],
    purchaseHistory: [
      {
        id: 'pur-abc-101',
        item: 'Emergency Tarping & Drone Inspection',
        amount: 450,
        date: '2026-11-08',
        status: 'Paid',
        invoiceNumber: 'INV-ABC-1001',
      },
    ],
  },
  {
    id: 'lead-abc-002',
    name: 'David Miller',
    phone: '(214) 555-0233',
    email: 'dmiller@dallastech.com',
    customerStatus: 'Lead',
    propertyOwnership: 'Owner',
    status: 'New Lead',
    zipCode: '75204',
    roofIssue: 'Flashing replacement along patio overhang',
    agentType: 'Chatbot',
    chatLog: [
      { sender: 'System', text: 'Lead captured via Website Widget', timestamp: '2026-11-09 08:30 AM' },
    ],
    purchaseHistory: [],
  },
];

const INITIAL_DEMO_LEADS_XYZ: Lead[] = [
  {
    id: 'lead-xyz-001',
    name: 'Sarah Johnson',
    phone: '(817) 555-0144',
    email: 'sarah.j@outlook.com',
    customerStatus: 'VIP',
    propertyOwnership: 'Owner',
    status: 'Closed-Won',
    scheduledDate: '2026-11-15 02:00 PM',
    appointmentDetails: {
      date: '2026-11-15',
      time: '02:00 PM',
      notes: 'Premium standing-seam metal roof replacement.',
    },
    zipCode: '76102',
    roofIssue: 'Complete metal roof upgrade for 4,200 sq ft estate',
    agentType: 'Phone Call',
    chatLog: [
      { sender: 'User', text: 'We want to replace our entire wood shake roof with architectural metal.', timestamp: '2026-11-07 02:20 PM' },
      { sender: 'AI', text: 'XYZ Roofing is the premier standing-seam specialist in Fort Worth. We will assign our senior estimator.', timestamp: '2026-11-07 02:22 PM' },
      { sender: 'System', text: 'Contract signed. Down payment received.', timestamp: '2026-11-08 11:00 AM' },
    ],
    purchaseHistory: [
      {
        id: 'pur-xyz-501',
        item: 'Architectural Metal Roof Deposit (50%)',
        amount: 14500,
        date: '2026-11-08',
        status: 'Paid',
        invoiceNumber: 'INV-XYZ-2041',
      },
      {
        id: 'pur-xyz-502',
        item: 'Structural Engineering Review',
        amount: 1200,
        date: '2026-11-08',
        status: 'Paid',
        invoiceNumber: 'INV-XYZ-2042',
      },
    ],
  },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

const SAVE_DEBOUNCE_MS = 800;

function leadChanged(a: Lead, b: Lead): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [availableCompanies, setAvailableCompanies] = useState<CompanyInfo[]>(DEFAULT_COMPANIES);
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    ...defaultCompanySettings,
    companyName: 'ABC Roofing',
    city: 'Dallas, TX',
  });
  const [leads, setLeadsState] = useState<Lead[]>(INITIAL_DEMO_LEADS_ABC);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [tenantId, setTenantId] = useState<string | null>(ABC_ROOFING_TENANT_ID);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(
    supabase ? 'loading' : 'ready',
  );
  const [storageError, setStorageError] = useState<string | null>(null);

  const isolatedDemoLeads = useRef<Record<string, Lead[]>>({
    [ABC_ROOFING_TENANT_ID]: INITIAL_DEMO_LEADS_ABC,
    [XYZ_ROOFING_TENANT_ID]: INITIAL_DEMO_LEADS_XYZ,
  });

  const leadsRef = useRef<Lead[]>(INITIAL_DEMO_LEADS_ABC);
  const tenantRef = useRef<string | null>(ABC_ROOFING_TENANT_ID);
  const configLoaded = useRef(false);

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Storage request failed.';
    setStorageError(msg);
  }, []);

  const activeCompany = availableCompanies.find((c: CompanyInfo) => c.id === tenantId) ?? availableCompanies[0] ?? null;

  // ---- Load tenant data strictly isolated to a tenant ID ----------------
  const loadTenantData = useCallback(async (targetTenantId: string) => {
    tenantRef.current = targetTenantId;
    setTenantId(targetTenantId);

    if (!supabase) {
      const demoRows = isolatedDemoLeads.current[targetTenantId] || [];
      leadsRef.current = demoRows;
      setLeadsState(demoRows);
      const company = DEFAULT_COMPANIES.find((c: CompanyInfo) => c.id === targetTenantId);
      if (company) {
        setCompanySettings((prev) => ({
          ...prev,
          companyName: company.name,
          city: company.city || prev.city,
        }));
      }
      setStorageStatus('ready');
      configLoaded.current = true;
      return;
    }

    configLoaded.current = false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const profileQuery = user
        ? supabase.from('contractor_profiles').select('company_name, location, financing_available').eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [cfg, rows, profileResult, comps] = await Promise.all([
        fetchTenantConfig(targetTenantId).catch(() => ({ settings: {} })),
        fetchLeads(targetTenantId).catch(() => []),
        profileQuery,
        fetchUserCompanies(),
      ]);

      setAvailableCompanies(comps);

      // Verify that the user has legitimate access to targetTenantId
      if (user && comps.length > 0 && !comps.some((c: CompanyInfo) => c.id === targetTenantId)) {
        setStorageError('Unauthorized: You do not have access to this organization.');
        setStorageStatus('error');
        leadsRef.current = [];
        setLeadsState([]);
        return;
      }

      const profile = !profileResult.error && profileResult.data ? {
        companyName: profileResult.data.company_name,
        location: profileResult.data.location,
        financing: profileResult.data.financing_available === true,
      } : null;

      const compMeta = comps.find((c: CompanyInfo) => c.id === targetTenantId);
      const mergedSettings = settingsForTenant(cfg.settings, profile);
      if (compMeta) {
        mergedSettings.companyName = compMeta.name || mergedSettings.companyName;
        if (compMeta.city) mergedSettings.city = compMeta.city;
      }

      setCompanySettings(mergedSettings);

      // When connected to live Supabase, use database rows directly (never fall back to demo leads)
      leadsRef.current = rows;
      setLeadsState(rows);
      configLoaded.current = true;
      setStorageError(null);
      setStorageStatus('ready');
    } catch (e) {
      fail(e);
      leadsRef.current = [];
      setLeadsState([]);
      setStorageStatus('error');
    }
  }, [fail]);

  const switchCompany = useCallback(async (newTenantId: string) => {
    // If Supabase is active, ensure user has authorization to access newTenantId
    if (supabase && availableCompanies.length > 0) {
      const isAllowed = availableCompanies.some((c: CompanyInfo) => c.id === newTenantId);
      if (!isAllowed) {
        setStorageError('Unauthorized: You do not have membership in this organization workspace.');
        return;
      }
    }
    setStorageStatus('loading');
    await loadTenantData(newTenantId);
  }, [availableCompanies, loadTenantData]);

  const loadTenant = useCallback(async () => {
    if (!supabase) {
      await loadTenantData(tenantRef.current || ABC_ROOFING_TENANT_ID);
      return;
    }
    try {
      const id = await fetchMyTenantId();
      if (!id) {
        setStorageStatus('signed-out');
        leadsRef.current = [];
        setLeadsState([]);
        return;
      }
      await loadTenantData(id);
    } catch (e) {
      fail(e);
      setStorageStatus('error');
    }
  }, [fail, loadTenantData]);

  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!supabase) {
      void loadTenantData(ABC_ROOFING_TENANT_ID);
      return;
    }
    if (!userId) {
      tenantRef.current = ABC_ROOFING_TENANT_ID;
      void loadTenantData(ABC_ROOFING_TENANT_ID);
      return;
    }
    setStorageStatus('loading');
    void loadTenant();
  }, [userId, loadTenant, loadTenantData]);

  // ---- Persist tenant settings (debounced) ------------------------------
  useEffect(() => {
    if (!configLoaded.current || !tenantRef.current || !supabase) return;
    const id = tenantRef.current;
    const t = setTimeout(() => {
      saveTenantConfig(id, companySettings).catch(fail);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [companySettings, fail]);

  // ---- Leads: synchronized with tenant isolation -----------------------
  const setLeads: React.Dispatch<React.SetStateAction<Lead[]>> = useCallback((action) => {
    const prev = leadsRef.current;
    const next = typeof action === 'function' ? action(prev) : action;
    leadsRef.current = next;
    setLeadsState(next);

    const id = tenantRef.current;
    if (!id) return;

    isolatedDemoLeads.current[id] = next;

    if (!supabase) return;

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
      }).catch(() => { /* keep optimistic state */ });
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
      customerStatus: newLead.customerStatus || 'Lead',
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
      purchaseHistory: newLead.purchaseHistory || [],
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
    }).catch(() => { /* never rejects */ });

    return { ok: true, lead: leadWithId };
  };

  return (
    <AppContext.Provider value={{
      companySettings, setCompanySettings,
      leads, setLeads,
      activeTab, setActiveTab,
      addLead,
      tenantId,
      availableCompanies,
      activeCompany,
      switchCompany,
      storageStatus, storageError, refreshTenant: loadTenant,
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
