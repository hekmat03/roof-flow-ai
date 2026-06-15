import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Terminal, Save, Play, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';

export const PromptPlayground: React.FC = () => {
  const { prompts, setPrompts, companySettings } = useApp();
  const [selectedAgent, setSelectedAgent] = useState<'agent1' | 'agent2' | 'agent3' | 'agent4'>('agent1');
  const [promptText, setPromptText] = useState(prompts[selectedAgent]);
  const [isSaved, setIsSaved] = useState(false);

  // Synchronize when agent selection changes
  React.useEffect(() => {
    setPromptText(prompts[selectedAgent]);
  }, [selectedAgent, prompts]);

  // Handle Save
  const handleSave = () => {
    setPrompts(prev => ({
      ...prev,
      [selectedAgent]: promptText
    }));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  // Reset current prompt
  const handleReset = () => {
    let defaultText = '';
    if (selectedAgent === 'agent1') {
      defaultText = `You are the Website Lead Capture Chatbot for {{companyName}} in {{city}}.
Your goals:
1. Capture the homeowner's Name, Phone, and Email.
2. Confirm they are the homeowner (Property Ownership = Owner).
3. Handle storm/objection inquiries about recent {{stormName}} on {{stormDate}}.
4. Schedule a FREE professional roof health inspection.`;
    } else if (selectedAgent === 'agent2') {
      defaultText = `You are the Interactive Phone Voice Assistant.
Your goals:
1. Greet callers warmly with a professional corporate roofing tone.
2. Quickly qualify if they have active storm damage from {{stormName}} in {{city}}.
3. Offer financing options: {{financingOptions}}.
4. Secure a scheduled time for an inspection.`;
    } else if (selectedAgent === 'agent3') {
      defaultText = `You are the SMS/Email Follow-Up & Nurture Agent.
Your goals:
1. Reactivate cold leads that filled out forms but did not book an inspection.
2. Reference local hail events and urgent storm inspection deadlines.
3. Keep the conversation conversational, low-pressure but urgent.`;
    } else {
      defaultText = `You are the Estimate Follow-Up Agent.
Your goals:
1. Follow up with homeowners within 24h/3d/7d of receiving a repair estimate.
2. Address typical contractor objections (e.g., insurance claim delays, financing, budget, competitor price matching).
3. Offer low-interest payment terms: {{financingOptions}}.`;
    }
    setPromptText(defaultText);
  };

  // Real-time Preview Renderer replacing {{variables}}
  const renderPreview = (text: string) => {
    if (!text) return '';
    return text
      .replace(/{{companyName}}/g, companySettings.companyName)
      .replace(/{{city}}/g, companySettings.city)
      .replace(/{{stormName}}/g, companySettings.stormName)
      .replace(/{{stormDate}}/g, companySettings.stormDate)
      .replace(/{{financingOptions}}/g, companySettings.financingOptions);
  };

  const agentsInfo = {
    agent1: { title: 'Agent 1: Website Lead Capture Chatbot', model: 'Gemini 3.5 Flash', latency: '~1.2s' },
    agent2: { title: 'Agent 2: Inbound Call Voice Handler', model: 'Gemini 3.5 Flash (Audio)', latency: '~800ms' },
    agent3: { title: 'Agent 3: Follow-Up & Nurture SMS/Email', model: 'Gemini 3.5 Flash', latency: '~1.5s' },
    agent4: { title: 'Agent 4: Estimate Follow-Up Negotiator', model: 'Gemini 3.5 Flash', latency: '~1.4s' },
  };

  return (
    <div className="space-y-6 animate-fadeIn h-full flex flex-col">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">System Prompt Playground</h2>
        <p className="text-xs text-slate-400 mt-1">
          Review, customize and live-preview the actual core LLM system instructions driving each conversational agent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Editor (7 cols) */}
        <div className="lg:col-span-7 bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div className="space-y-6 flex-1 flex flex-col">
            {/* Tab Selector */}
            <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              {(['agent1', 'agent2', 'agent3', 'agent4'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSelectedAgent(tab)}
                  className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition ${
                    selectedAgent === tab
                      ? 'bg-orange-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Agent {tab === 'agent1' ? '1' : tab === 'agent2' ? '2' : tab === 'agent3' ? '3' : '4'}
                </button>
              ))}
            </div>

            {/* Prompt Meta Info */}
            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-3">
              <div>
                <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[9px]">Active Persona</span>
                <span className="text-white font-bold">{agentsInfo[selectedAgent].title}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[9px]">Pre-configured Model</span>
                <span className="text-orange-400 font-mono font-bold">{agentsInfo[selectedAgent].model}</span>
              </div>
            </div>

            {/* Textarea Instruction Block */}
            <div className="flex-1 flex flex-col min-h-[300px]">
              <label className="text-xs text-slate-400 block mb-2 font-semibold">System Instructions (Prompt Template)</label>
              <textarea
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                className="w-full flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-400 focus:outline-none focus:border-orange-500 leading-relaxed resize-none h-full"
                placeholder="Enter system prompts here..."
              />
            </div>
          </div>

          {/* Prompt Buttons */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-6 shrink-0">
            <button
              onClick={handleReset}
              className="bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-slate-800 font-semibold px-4 py-2 rounded-xl text-xs transition border border-slate-800/80 flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Current Agent Template
            </button>

            <div className="flex items-center space-x-3">
              {isSaved && (
                <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4.5 w-4.5 stroke-[2.5]" /> Agent Prompt Synced!
                </span>
              )}
              <button
                onClick={handleSave}
                className="bg-orange-500 hover:bg-orange-600 text-slate-950 font-black px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-orange-500/20 flex items-center gap-1.5"
              >
                <Save className="h-4 w-4" />
                Apply Prompts
              </button>
            </div>
          </div>
        </div>

        {/* Live Preview (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md flex-1 flex flex-col">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sparkles className="h-4.5 w-4.5 text-orange-500" /> Compiled System Prompt
            </h3>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              Below is the exact output fed into the model with active variables (deductibles, city names, company details) dynamically injected.
            </p>

            <div className="mt-4 flex-1 bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-[11px] text-slate-300 overflow-y-auto leading-relaxed max-h-[420px]">
              {renderPreview(promptText)}
            </div>
          </div>

          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md text-xs space-y-3">
            <h4 className="text-sm font-bold text-white">Dynamic Variables Key</h4>
            <p className="text-slate-400">You can use these brackets in any system prompt to pull values instantly from system configurations:</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-300">{"{{companyName}}"}</div>
              <div className="bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-300">{"{{city}}"}</div>
              <div className="bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-300">{"{{stormName}}"}</div>
              <div className="bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-300">{"{{stormDate}}"}</div>
              <div className="bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-300 col-span-2">{"{{financingOptions}}"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
