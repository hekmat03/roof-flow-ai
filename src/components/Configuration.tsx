import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';

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
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">System Configuration</h2>
        <p className="text-xs text-slate-400 mt-1">
          Customize contractor identity, active weather storm parameters, financing agreements, and AI agent vocabulary tones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Form */}
        <div className="lg:col-span-2 bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md">
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-semibold">Target Metro City/Region</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500 font-medium"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-semibold">Storm Event Occurrence Date</label>
                <input
                  type="text"
                  value={stormDate}
                  onChange={e => setStormDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500 font-medium"
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500 font-medium leading-relaxed"
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500 font-medium leading-relaxed"
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
                  className="bg-orange-500 hover:bg-orange-600 text-slate-950 font-black px-6 py-2.5 rounded-xl text-sm transition shadow-lg shadow-orange-500/20"
                >
                  Save Global Configurations
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Info sidebar helper */}
        <div className="space-y-6">
          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md">
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
    </div>
  );
};
