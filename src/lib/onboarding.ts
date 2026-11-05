import { supabase } from './supabase';

export interface OnboardingData {
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  website: string;
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
  licenseNumber: string;
}

export async function saveOnboarding(
  userId: string,
  data: OnboardingData
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Accounts are not configured.' };
  const { error } = await supabase
    .from('contractor_profiles')
    .upsert({
      user_id: userId,
      company_name: data.companyName,
      owner_name: data.ownerName,
      phone: data.phone,
      email: data.email,
      website: data.website,
      location: data.location,
      open_time: data.openTime,
      close_time: data.closeTime,
      emergency_available: data.emergency,
      emergency_phone: data.emergencyPhone,
      working_days: data.days,
      services: data.services,
      inspection_price: data.inspectionPrice,
      repair_price_min: data.repairPriceMin,
      repair_price_max: data.repairPriceMax,
      financing_available: data.financing,
      faqs: data.faqs,
      service_radius: data.serviceRadius,
      years_in_business: data.yearsInBusiness,
      license_number: data.licenseNumber,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function getOnboarding(
  userId: string
): Promise<OnboardingData | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('contractor_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return {
    companyName: data.company_name || '',
    ownerName: data.owner_name || '',
    phone: data.phone || '',
    email: data.email || '',
    website: data.website || '',
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
    licenseNumber: data.license_number || '',
  };
}

export async function isOnboardingComplete(
  userId: string
): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('contractor_profiles')
    .select('onboarding_complete')
    .eq('user_id', userId)
    .maybeSingle();

  // null = could not check (network / table missing). No row = not onboarded yet.
  if (error) {
    console.warn('onboarding check failed:', error.message);
    return null;
  }
  return data?.onboarding_complete === true;
}
