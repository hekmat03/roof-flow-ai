import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, ShieldCheck, RefreshCw, AlertCircle, Webhook, CheckCircle2, XCircle, PlugZap } from 'lucide-react';
import { fetchCapabilities, type AgentCapabilities } from '../utils/aiService';
import {
  getWebhookUrl,
  setWebhookUrl,
  WEBHOOK_URL_STORAGE,
  postLeadToWebhook,
} from '../utils/webhook';

export const Configuration: React.FC = () => {
  const { companySettings, setCompanySettings } = useApp();
  
  // Local form state
  const [companyName, setCompanyName] = useState(companySettings.companyName);
  const [city, setCity] = useState(companySettings.city);
  const [stormName, setStormName] = useState(companySettings.stormName);
  const [stormDate, setStormDate] = useState(companySettings.stormDate);
  const [financingOptions, setFinancingOptions] = useState(companySettings.financingOptions);
  const [agentTone, setAgentTone] = useState(companySettings.agentTone);
  
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCompanySettings({
      companyName,
      city,
      stormName,
      stormDate,
      financingOptions,
      agentTone,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleReset = () => {
    if (window.confirm('Reset company configurations to default values?')) {
      setCompanyName('RoofFlow AI Roofing');
      setCity('Dallas-Fort Worth');
      setStormName('Great Hailstorm of 2026');
      setStormDate('May 15, 2026');
      setFinancingOptions('0% APR for 12 months, or low-interest plans starting at $99/mo');
      setAgentTone('Professional, reassuring, hazard-focused, and highly helpful');
      
      setCompanySettings({
        companyName: 'RoofFlow AI Roofing',
        city: 'Dallas-Fort Worth',
        stormName: 'Great Hailstorm of 2026',
        stormDate: 'May 15, 2026',
        financingOptions: '0% APR for 12 months, or low-interest plans starting at $99/mo',
        agentTone: 'Professional, reassuring, hazard-focused, and highly helpful',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">System Configuration</h2>
        <p className="text-xs text-slate-400 mt-1">
          Customize contractor identity, active weather storm parameters, financing agreements, and AI agent vocabulary tones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Form */}
        <div className="lg:col-span-2 glass card-hover rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800">
              <Settings className="h-4.5 w-4.5 text-orange-500" /> Identity & Campaign Parameters
            </h3>

            {/* Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <span className="text-[10px] text-slate-500 mt-1.5 block">Used by Phone/Estimate Agents to answer "How will I pay for my deductible?"</span>
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
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                    <ShieldCheck className="h-4.5 w-4.5 stroke-[2.5]" /> Configuration Synced!
                  </span>
                )}
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

        {/* Info sidebar helper */}
        <div className="space-y-6">
          <div className="glass card-hover rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-3">Settings Synchronization</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Updates saved in this configuration panel are instantly propagated across all four simulators.
            </p>
            <div className="mt-4 space-y-3">
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex items-start space-x-2 text-xs">
                <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <span className="text-slate-300">
                  Changing the company name or active storm will modify system instructions dynamically.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Integrations (server-side AI + Google Sheets webhook) */}
      <IntegrationPanel />
    </div>
  );
};

/**
 * IntegrationPanel — live integrations.
 *  - AI engine: read-only status. The provider key lives in server env vars
 *    (MISTRAL_API_KEY on Vercel) and is never entered or stored in the browser.
 *  - Google Sheets Webhook URL: stored under "roofflow_webhook_url". When
 *    present, every lead captured by ANY simulator is POSTed to it as JSON.
 */
const IntegrationPanel: React.FC = () => {
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
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <PlugZap className="h-4.5 w-4.5 text-orange-500" /> Live Integrations (Free Tier)
          </h3>
          <p className="text-xs text-slate-400 mt-1.5">
            Wire real AI inference and real CRM storage into the simulators. Everything degrades gracefully —
            the built-in engine keeps working when these are empty.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* AI engine status (server-side key) */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-300 font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400" /> AI Engine (server-side)
            </label>
            {aiLive ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" /> LIVE AI ON
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-full">
                <XCircle className="h-3 w-3" /> {ai === 'loading' ? 'CHECKING…' : 'BUILT-IN ENGINE'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {aiLive
              ? `Agents answer through the secure server endpoint (${ai.model ?? ''}). No API key is stored in this browser.`
              : 'Live AI is off. Add MISTRAL_API_KEY in your Vercel project environment variables and redeploy. Until then the built-in offline engine answers.'}
          </p>
          {aiLive && (
            <div className="flex flex-wrap gap-2 text-[10px] font-bold">
              <span className={ai.storage ? 'text-emerald-400' : 'text-slate-500'}>{ai.storage ? '✓' : '○'} Database (Supabase)</span>
              <span className={ai.email ? 'text-emerald-400' : 'text-slate-500'}>{ai.email ? '✓' : '○'} Email delivery — not available</span>
              <span className="text-amber-400">○ SMS: demo mode</span>
            </div>
          )}
        </div>

        {/* Google Sheets Webhook URL */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-300 font-bold flex items-center gap-2">
              <Webhook className="h-4 w-4 text-blue-400" /> Google Sheets Webhook URL
              <span className="font-mono text-[9px] text-slate-500 hidden sm:inline">({WEBHOOK_URL_STORAGE})</span>
            </label>
            {urlConfigured ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
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
        </div>
      </div>
    </div>
  );
};
