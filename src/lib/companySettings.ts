import type { CompanySettings } from '../context/AppContext';

export const DEFAULT_AGENT_TONE = 'Professional, clear, and helpful';

const LEGACY_SAMPLE_SETTINGS: CompanySettings = {
  companyName: 'RoofFlow AI Roofing',
  city: 'Dallas-Fort Worth',
  stormName: 'Great Hailstorm of 2026',
  stormDate: 'May 15, 2026',
  financingOptions: '0% APR for 12 months, or low-interest plans starting at $99/mo',
  agentTone: DEFAULT_AGENT_TONE,
};

export const EMPTY_COMPANY_SETTINGS: CompanySettings = {
  companyName: '',
  city: '',
  stormName: '',
  stormDate: '',
  financingOptions: '',
  agentTone: DEFAULT_AGENT_TONE,
};

export interface ContractorCompanyProfile {
  companyName?: string | null;
  location?: string | null;
  financing?: boolean;
}

/** Fill uncustomized tenant settings from onboarding facts and remove old demo defaults. */
export function settingsForTenant(
  settings: Partial<CompanySettings>,
  profile: ContractorCompanyProfile | null,
): CompanySettings {
  const companyName = settings.companyName?.trim();
  const city = settings.city?.trim();
  const financingOptions = settings.financingOptions?.trim();

  return {
    ...EMPTY_COMPANY_SETTINGS,
    ...settings,
    companyName: !companyName || companyName === LEGACY_SAMPLE_SETTINGS.companyName
      ? profile?.companyName?.trim() || ''
      : companyName,
    city: !city || city === LEGACY_SAMPLE_SETTINGS.city
      ? profile?.location?.trim() || ''
      : city,
    stormName: settings.stormName === LEGACY_SAMPLE_SETTINGS.stormName ? '' : settings.stormName || '',
    stormDate: settings.stormDate === LEGACY_SAMPLE_SETTINGS.stormDate ? '' : settings.stormDate || '',
    financingOptions: !financingOptions || financingOptions === LEGACY_SAMPLE_SETTINGS.financingOptions
      ? profile?.financing ? 'Financing available, ask us for details' : ''
      : financingOptions,
    agentTone: settings.agentTone || DEFAULT_AGENT_TONE,
  };
}
