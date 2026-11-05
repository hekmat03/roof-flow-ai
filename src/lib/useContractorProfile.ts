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
      if (!supabase) {
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('contractor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

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

/**
 * Compact plain-text facts about the contractor. Sent to the server as
 * context.businessInfo; the server adds it to the system prompt.
 * Empty fields are skipped so the AI is never given blanks.
 */
export function buildBusinessInfo(profile: ContractorProfile): string {
  const lines: string[] = [];

  if (profile.companyName) lines.push(`Company: ${profile.companyName}`);
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.serviceRadius)
    lines.push(`Service area: ${profile.serviceRadius} miles`);
  if (profile.yearsInBusiness)
    lines.push(`Years in business: ${profile.yearsInBusiness}`);

  if (profile.days.length > 0)
    lines.push(
      `Hours: ${profile.days.join(', ')} ${profile.openTime}-${profile.closeTime}`
    );

  if (profile.emergency) {
    lines.push(
      profile.emergencyPhone
        ? `After-hours/emergency service: yes, phone ${profile.emergencyPhone}`
        : 'After-hours/emergency service: yes'
    );
  } else {
    lines.push('After-hours/emergency service: no');
  }

  if (profile.services.length > 0)
    lines.push(`Services: ${profile.services.join(', ')}`);
  if (profile.inspectionPrice)
    lines.push(`Inspection price: ${profile.inspectionPrice}`);
  if (profile.repairPriceMin || profile.repairPriceMax)
    lines.push(
      `Typical repair range: ${profile.repairPriceMin || '?'} to ${profile.repairPriceMax || '?'}`
    );
  lines.push(`Financing: ${profile.financing ? 'available' : 'not offered'}`);

  const faqs = profile.faqs.filter((f) => f.question && f.answer);
  if (faqs.length > 0) {
    lines.push('FAQ:');
    faqs.forEach((f) => lines.push(`Q: ${f.question}\nA: ${f.answer}`));
  }

  return lines.join('\n').slice(0, 1800);
}
