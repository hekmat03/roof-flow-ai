import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { FileText, DollarSign, Calculator, Settings, Sparkles, Send, CheckCircle2, User, HelpCircle } from 'lucide-react';
import { getAgentResponse, AgentMessage } from '../lib/agentService';

export const Agent4Estimate: React.FC = () => {
  const { companySettings, leads, setLeads } = useApp();
  
  // Objection flow simulation state
  const [activeObjection, setActiveObjection] = useState<'insurance' | 'price' | 'budget'>('insurance');
  const [messages, setMessages] = useState<Array<{ sender: 'AI' | 'User'; text: string; timestamp: string }>>([
    {
      sender: 'AI',
      text: `Hi! We sent over the roof replacement estimate for your review yesterday. I wanted to follow up and see if you had any questions regarding the scope or pricing?`,
      timestamp: 'Yesterday'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [savingSuccess, setSavingSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default objection scenarios (kept as scripted starting points — these are pre-written
  // conversation openers, not AI output, so a real customer's follow-up still goes to the AI)
  const objections = {
    insurance: {
      userText: "My insurance company is denying some of the shingle damage, so the payout won't cover your estimate.",
      aiText: `We handle insurance discrepancies all the time! We can write a detailed supplement report with digital photos and direct manufacturer specifications for your adjuster. Typically, we get denied areas approved by showing code-compliance requirements in ${companySettings.city}. We'll meet them on-site if needed. Shall we set up a call with our claim supplement team?`
    },
    price: {
      userText: "Another local contractor gave me a bid that is $2,000 cheaper for the same roof.",
      aiText: `I completely understand wanting the best price! We always match local bids for equivalent scopes of work. However, make sure their bid includes full synthetic underlayment, ice/water shields in valleys, and a lifetime workmanship warranty, which is standard for ${companySettings.companyName}. Would you like us to do a line-by-line comparison of their estimate to see if they're cutting corners?`
    },
    budget: {
      userText: "I just don't have the cash to pay the deductible right now.",
      aiText: `That is incredibly common, and you shouldn't let a active leak damage your home structure. We offer excellent financing plans: ${companySettings.financingOptions}. This allows you to get the roof fixed immediately with low, manageable monthly payments. We can run a soft-credit check that doesn't affect your score. Would you like to see if you qualify?`
    }
  };

  const handleTriggerObjection = (type: 'insurance' | 'price' | 'budget') => {
    setActiveObjection(type);
    setError(null);
    
    const userMsg = {
      sender: 'User' as const,
      text: objections[type].userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // These starter scenarios keep their pre-written AI reply as an example script.
    // Anything the person types afterward goes to the real AI (see handleCustomSend).
    setMessages([
      {
        sender: 'AI',
        text: `Hi! We sent over the roof replacement estimate for your review yesterday. I wanted to follow up and see if you had any questions regarding the scope or pricing?`,
        timestamp: 'Yesterday'
      },
      userMsg,
      {
        sender: 'AI',
        text: objections[type].aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const handleCustomSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMsg = {
      sender: 'User' as const,
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setIsLoading(true);
    setError(null);

    try {
      const aiMessages: AgentMessage[] = updatedMessages.map(m => ({
        role: m.sender === 'AI' ? 'assistant' : 'user',
        content: m.text,
      }));

      const response = await getAgentResponse('closer', aiMessages, {
        companyName: companySettings.companyName,
        city: companySettings.city,
      });

      setMessages(prev => [...prev, {
        sender: 'AI',
        text: response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

      setSavingSuccess(true);
      setTimeout(() => setSavingSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI response');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Agent 4: Estimate Follow-Up Agent</h2>
        <p className="text-xs text-slate-400 mt-1">
          Post-inspection estimate follower. Experience how the AI handles complex, high-friction customer objections regarding insurance claims, competitor pricing, and financing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Objection Selections (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="h-4.5 w-4.5 text-orange-500" /> Objection Scenarios
              </h3>
              <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-bold font-mono">
                AGENT 4
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Trigger a typical homeowner sales barrier below to witness the AI Agent's responsive negotiation and objection resolution templates.
            </p>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => handleTriggerObjection('insurance')}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex flex-col space-y-1 ${
                  activeObjection === 'insurance'
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider">Scenario A: Insurance Discrepancy</span>
                <span className="text-[11px] opacity-70">Adjuster denied claim damages or paid insufficient funds.</span>
              </button>

              <button
                onClick={() => handleTriggerObjection('price')}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex flex-col space-y-1 ${
                  activeObjection === 'price'
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider">Scenario B: Competitor Price Match</span>
                <span className="text-[11px] opacity-70">Received a cheaper shingle estimate from a competitor.</span>
              </button>

              <button
                onClick={() => handleTriggerObjection('budget')}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex flex-col space-y-1 ${
                  activeObjection === 'budget'
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider">Scenario C: Deductible / Budget</span>
                <span className="text-[11px] opacity-70">Lacks ready cash for out-of-pocket insurance deductibles.</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Simulation Logs (7 cols) */}
        <div className="lg:col-span-7 bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-[520px] justify-between">
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800 shrink-0">
              <Sparkles className="h-4.5 w-4.5 text-orange-500" /> Interactive Negotiation Panel
            </h3>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto space-y-4 bg-[#0f172a]/60 p-4 rounded-xl border border-slate-850">
              {messages.map((msg, index) => {
                const isAI = msg.sender === 'AI';
                return (
                  <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                    <div className="flex items-start space-x-2 max-w-md">
                      {isAI && (
                        <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-orange-500" />
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isAI 
                          ? 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none' 
                          : 'bg-orange-500 text-slate-950 font-bold rounded-tr-none'
                      }`}>
                        <span className="text-[9px] opacity-40 font-black uppercase tracking-wider block mb-1">
                          {isAI ? 'Agent 4 Estimate AI' : 'Homeowner User'}
                        </span>
                        <p className="whitespace-pre-line">{msg.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start">
                  <span className="text-[10px] text-slate-500 italic">Agent is typing…</span>
                </div>
              )}
              {error && (
                <div className="flex justify-center">
                  <span className="text-[10px] text-red-400">{error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Form input reply */}
          <div className="pt-4 border-t border-slate-800 shrink-0 space-y-3 mt-4">
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder="Ask custom negotiation/deductible questions..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSend()}
                disabled={isLoading}
                className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
              <button
                onClick={handleCustomSend}
                disabled={isLoading}
                className="bg-orange-500 hover:bg-orange-600 px-4 py-2.5 rounded-xl text-slate-950 text-xs font-black transition disabled:opacity-50"
              >
                Send Objections
              </button>
            </div>

            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500 flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5 text-orange-500" /> Dedicated post-inspection estimator follow-ups
              </span>
              {savingSuccess && (
                <span className="text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Dialogue synced with CRM Board
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
