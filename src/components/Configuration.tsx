import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, ShieldCheck, RefreshCw, Webhook, CheckCircle2, XCircle, PlugZap } from 'lucide-react';
import { fetchCapabilities, type AgentCapabilities } from '../utils/aiService';
import {
  getWebhookUrl,
  setWebhookUrl,
  WEBHOOK_URL_STORAGE,
  postLeadToWebhook,
} from '../utils/webhook';
import { useContractorProfile } from '../lib/useContractorProfile';
import { DEFAULT_AGENT_TONE, EMPTY_COMPANY_SETTINGS } from '../lib/companySettings';

export const Configuration: React.FC = () => {
  const { companySettings, setCompanySettings } = useApp();
  const { profile, saveBusinessAddress } = useContractorProfile();

  // Local form state
  const [companyName, setCompanyName] = useState(companySettings.companyName);
  const [city, setCity] = useState(companySettings.city);
  const [stormName, setStormName] = useState(companySettings.stormName);
  const [stormDate, setStormDate] = useState(companySettings.stormDate);
  const [financingOptions, setFinancingOptions] = useState(companySettings.financingOptions);
  const [agentTone, setAgentTone] = useState(companySettings.agentTone);
  const [businessAddress, setBusinessAddress] = useState('');

  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setBusinessAddress(profile?.businessAddress || '');
  }, [profile?.businessAddress]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setCompanySettings({
      companyName,
      city,
      stormName,
      stormDate,
      financingOptions,
      agentTone,
    });
    try {
      await saveBusinessAddress(businessAddress.trim());
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the business address.');
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset company configurations to default values?')) {
      const resetSettings = {
        ...EMPTY_COMPANY_SETTINGS,
        companyName: profile?.companyName || '',
        city: profile?.location || '',
        financingOptions: profile?.financing ? 'Financing available, ask us for details' : '',
        agentTone: DEFAULT_AGENT_TONE,
      };
      setCompanyName(resetSettings.companyName);
      setCity(resetSettings.city);
      setStormName(resetSettings.stormName);
      setStormDate(resetSettings.stormDate);
      setFinancingOptions(resetSettings.financingOptions);
      setAgentTone(resetSettings.agentTone);
      setCompanySettings(resetSettings);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-white">System Configuration</h2>
        <p className="text-xs text-slate-400 mt-1">
          Customize contractor identity, active weather storm parameters, financing agreements, and AI agent vocabulary tones.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Editor Form */}
        <div className="glass card-hover rounded-2xl p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800">
              <Settings className="h-4.5 w-4.5 text-orange-500" /> Identity & Campaign Parameters
            </h3>

            {/* Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-semibold">Contractor Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="input-premium text-sm font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-semibold">Target Metro City/Region</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="input-premium text-sm font-medium"
                />
              </div>
            </div>

            {/* Row 2 */}
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold" htmlFor="business-address">Business Mailing Address (optional)</label>
              <textarea
                id="business-address"
                rows={2}
                value={businessAddress}
                onChange={e => setBusinessAddress(e.target.value)}
                className="input-premium text-sm font-medium"
                autoComplete="street-address"
                maxLength={300}
              />
              <span className="text-[10px] text-slate-500 mt-1.5 block">Required to send scheduled email follow-ups. Shown in the email footer.</span>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-semibold">Target Storm Event Name</label>
                <input
                  type="text"
                  value={stormName}
                  onChange={e => setStormName(e.target.value)}
                  className="input-premium text-sm font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-semibold">Storm Event Occurrence Date</label>
                <input
                  type="text"
                  value={stormDate}
                  onChange={e => setStormDate(e.target.value)}
                  className="input-premium text-sm font-medium"
                />
              </div>
            </div>

            {/* Textarea 1 */}
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Financing Objections Counter-Offer</label>
              <textarea
                rows={2}
                value={financingOptions}
                onChange={e => setFinancingOptions(e.target.value)}
                className="input-premium text-sm font-medium leading-relaxed"
              />
              <span className="text-[10px] text-slate-500 mt-1.5 block">Used by the chatbot to answer "How will I pay for my deductible?"</span>
            </div>

            {/* Textarea 2 */}
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Conversational AI Personality / Tone</label>
              <textarea
                rows={2}
                value={agentTone}
                onChange={e => setAgentTone(e.target.value)}
                className="input-premium text-sm font-medium leading-relaxed"
              />
              <span className="text-[10px] text-slate-500 mt-1.5 block">Overrides default response parameters across active models.</span>
            </div>

            {/* Buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleReset}
                className="bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-slate-800 font-semibold px-4 py-2.5 rounded-xl text-xs transition border border-slate-800/80 flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset Defaults
              </button>

              <div className="flex items-center space-x-3">
                {isSaved && (
                  <span className="text-accent-400 text-xs font-bold flex items-center gap-1">
                    <ShieldCheck className="h-4.5 w-4.5 stroke-[2.5]" /> Configuration Synced!
                  </span>
                )}
                {saveError && <span role="alert" className="text-red-400 text-xs">{saveError}</span>}
                <button
                  type="submit"
                  className="btn-accent px-6 py-2.5 text-sm"
                >
                  Save Global Configurations
                </button>
              </div>
            </div>
          </form>
        </div>

      </div>

      {/* Live Integrations (server-side AI + Google Sheets webhook) */}
      <IntegrationPanel />
    </div>
  );
};

/**
 * IntegrationPanel — concise current status plus the existing Sheets webhook controls.
 */
const IntegrationPanel: React.FC = () => {
  const { storageStatus } = useApp();
  const [ai, setAi] = useState<AgentCapabilities | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    fetchCapabilities().then(s => { if (alive) setAi(s); });
    return () => { alive = false; };
  }, []);
  const aiLive = ai !== 'loading' && ai !== null && ai.live;

  const [urlInput, setUrlInput] = useState(getWebhookUrl());
  const [urlConfigured, setUrlConfigured] = useState(getWebhookUrl().length > 0);
  const [testing, setTesting] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle');

  const handleSaveUrl = () => {
    setWebhookUrl(urlInput.trim());
    setUrlConfigured(getWebhookUrl().length > 0);
  };

  const handleTestWebhook = async () => {
    setTesting('running');
    const ok = await postLeadToWebhook({
      name: 'Webhook Test',
      phone: '(000) 000-0000',
      email: 'test@roofflow.ai',
      zip: '00000',
      roofIssue: 'Integration test ping',
      status: 'New Lead',
      source: 'Configuration Panel',
      timestamp: new Date().toISOString(),
    });
    setTesting(ok ? 'ok' : 'fail');
    setTimeout(() => setTesting('idle'), 4000);
  };

  return (
    <div className="space-y-3">
      <section className="glass rounded-xl p-4" aria-label="Live integrations">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white flex items-center gap-2"><PlugZap className="h-4 w-4 text-orange-500" /> Live integrations</h3>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 py-3 text-xs md:grid-cols-4">
        <div><dt className="text-slate-500">AI</dt><dd className="text-slate-200">{ai === 'loading' ? 'Checking' : ai === null ? 'Unavailable' : aiLive ? 'Live' : 'Not live'}</dd></div>
        <div><dt className="text-slate-500">Database</dt><dd className="text-slate-200">{storageStatus === 'loading' ? 'Checking' : storageStatus === 'ready' ? 'Connected' : 'Not connected'}</dd></div>
        <div><dt className="text-slate-500">Email</dt><dd className="text-slate-200">{ai === 'loading' ? 'Checking' : ai === null ? 'Unavailable' : ai.email ? 'Configured' : 'Not configured'}</dd></div>
        <div><dt className="text-slate-500">SMS</dt><dd className="text-slate-200">Not available</dd></div>
      </dl>
      </section>

      <section className="glass rounded-xl p-4 space-y-3" aria-label="Google Sheets webhook">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-300 font-bold flex items-center gap-2">
              <Webhook className="h-4 w-4 text-blue-400" /> Google Sheets Webhook URL
              <span className="font-mono text-[9px] text-slate-500 hidden sm:inline">({WEBHOOK_URL_STORAGE})</span>
            </label>
            {urlConfigured ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" /> CRM PUSH ON
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-full">
                <XCircle className="h-3 w-3" /> LOCAL CRM ONLY
              </span>
            )}
          </div>
          <div className="flex space-x-2">
            <input
              type="url"
              placeholder="https://script.google.com/macros/s/…/exec"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              className="flex-1 input-premium px-3 py-2 text-xs font-mono"
            />
            <button onClick={handleSaveUrl} className="btn-accent px-4 py-2 text-xs font-bold min-h-0">
              Save
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Apps Script Web App URL (deploy: "Anyone") — appends each captured lead as a Sheet row</span>
            <button
              onClick={handleTestWebhook}
              disabled={!urlConfigured || testing === 'running'}
              className="btn-ghost px-2.5 py-1 rounded-md text-[10px] min-h-0 disabled:opacity-40"
            >
              {testing === 'running' ? 'Testing…' : testing === 'ok' ? 'Sent ✓' : testing === 'fail' ? 'Failed ✗' : 'Send test row'}
            </button>
          </div>
      </section>
    </div>
  );
};
