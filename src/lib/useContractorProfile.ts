import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export interface ContractorProfile {
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  location: string;
  openTime: string;
  closeTime: string;
  emergency: boolean;
  emergencyPhone: string;
  days: string[];
  services: string[];
  inspectionPrice: string;
  repairPriceMin: string;
  repairPriceMax: string;
  financing: boolean;
  faqs: { question: string; answer: string }[];
  serviceRadius: string;
  yearsInBusiness: string;
}

export function useContractorProfile() {
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('contractor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setProfile({
          companyName: data.company_name || '',
          ownerName: data.owner_name || '',
          phone: data.phone || '',
          email: data.email || '',
          location: data.location || '',
          openTime: data.open_time || '08:00',
          closeTime: data.close_time || '16:00',
          emergency: data.emergency_available || false,
          emergencyPhone: data.emergency_phone || '',
          days: data.working_days || [],
          services: data.services || [],
          inspectionPrice: data.inspection_price || '',
          repairPriceMin: data.repair_price_min || '',
          repairPriceMax: data.repair_price_max || '',
          financing: data.financing_available || false,
          faqs: data.faqs || [],
          serviceRadius: data.service_radius || '',
          yearsInBusiness: data.years_in_business || '',
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  return { profile, loading };
}

export function buildSystemPrompt(profile: ContractorProfile): string {
  const hours = `${profile.openTime} - ${profile.closeTime}`;
  const days = profile.days.join(', ');
  const services = profile.services.join(', ');
  const faqText = profile.faqs
    .filter(f => f.question && f.answer)
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  return `You are an AI sales assistant for ${profile.companyName} 
located in ${profile.location}.

BUSINESS HOURS: ${hours} (${days})
${profile.emergency ? `EMERGENCY LINE: ${profile.emergencyPhone} (24/7 available)` : ''}

SERVICES OFFERED: ${services}

PRICING:
- Inspection: ${profile.inspectionPrice || 'Free'}
- Repairs: ${profile.repairPriceMin} - ${profile.repairPriceMax}
- Financing: ${profile.financing ? 'Available' : 'Not available'}

SERVICE AREA: ${profile.serviceRadius} miles radius

EXPERIENCE: ${profile.yearsInBusiness} years in business

FREQUENTLY ASKED QUESTIONS:
${faqText}

YOUR GOALS:
1. Answer customer questions accurately using the info above
2. Qualify the homeowner (storm damage, ownership)
3. Capture their Name, Phone, Email
4. Book a FREE roof inspection
5. Be professional, friendly and helpful
6. Never make up information not provided above`;
}
