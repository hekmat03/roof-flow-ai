
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Lead } from '../context/AppContext';
import { FileText, DollarSign, Calculator, Settings, Sparkles, Send, CheckCircle2, User, HelpCircle } from 'lucide-react';
import { getAgentResponse, detectIntent, type AgentMessage, type AgentContext } from '../lib/agentService';
import { extractEmail, extractPhone, extractZip } from '../utils/leadExtract';

export const Agent4Estimate: React.FC = () => {
  const { companySettings, leads, setLeads, addLead } = useApp();

  // CRM target — which estimate-stage lead this follow-up conversation belongs
  // to. Every exchange is synced to that lead's transcript and drives its
  // workflow status (yes → Closed-Won, no/opt-out → Closed-Lost).
  // With NO estimate-stage leads in the CRM, a homeowner name can be typed
  // instead and the conversation CREATES that lead on first sync — so the
  // closer flow produces a real CRM record from an empty board too.
  const leadTargets = leads.filter(l =>
    ['Estimate Sent', 'Inspection Completed', 'In Contact'].includes(l.status)
  );
  const [targetLeadId, setTargetLeadId] = useState<string>(() =>
    leads.find(l => l.status === 'Estimate Sent')?.id || leads[0]?.id || ''
  );
  const [coldLeadName, setColdLeadName] = useState('');

  const syncToCRM = (userText: string, aiReply: string) => {
    const intent = detectIntent(userText);
    const nextStatus: Lead['status'] =
      intent === 'yes' ? 'Closed-Won'
      : intent === 'no' || intent === 'optout' ? 'Closed-Lost'
      : 'In Contact';
    const exchange = [
      { sender: 'User' as const, text: userText, timestamp: new Date().toLocaleString() },
      { sender: 'AI' as const, text: aiReply, timestamp: new Date().toLocaleString() },
    ];

    if (targetLeadId) {
      setLeads(prev => prev.map(lead => {
        if (lead.id !== targetLeadId) return lead;
        const status: Lead['status'] =
          intent === 'yes' ? 'Closed-Won'
          : intent === 'no' || intent === 'optout' ? 'Closed-Lost'
          : lead.status === 'In Contact' ? lead.status
          : 'In Contact';
        return {
          ...lead,
          status,
          chatLog: [...lead.chatLog, ...exchange],
        };
      }));
    } else if (coldLeadName.trim()) {
      // No estimate-stage lead targeted — capture the follow-up as a new lead.
      addLead({
        name: coldLeadName.trim(),
        phone: extractPhone(userText) || 'N/A',
        email: extractEmail(userText) || 'N/A',
        propertyOwnership: 'Owner',
        status: nextStatus,
        agentType: 'Estimate Follow-Up',
        zipCode: extractZip(userText),
        roofIssue: 'Roof replacement estimate follow-up',
        chatLog: [
          { sender: 'System', text: 'Post-estimate follow-up conversation (simulated recipient).', timestamp: new Date().toLocaleString() },
          ...exchange,
        ],
      });
    } else {
      return; // nothing to sync to
    }
    setSavingSuccess(true);
    setTimeout(() => setSavingSuccess(false), 2500);
  };
  
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

  // Default objection scenarios — the user message is fixed, but the AI's
  // reply is GENERATED live by the dynamic closer agent (settings-aware, varied),
  // not hardcoded.
  const objections = {
    insurance: {
      userText: "My insurance company is denying some of the shingle damage, so the payout won't cover your estimate."
    },
    price: {
      userText: "Another local contractor gave me a bid that is $2,000 cheaper for the same roof."
    },
    budget: {
      userText: "I just don't have the cash to pay the deductible right now."
    }
  };

  const agentContext: AgentContext = {
    companyName: companySettings.companyName,
    city: companySettings.city,
    stormEvent: companySettings.stormName,
    stormDate: companySettings.stormDate,
    financingOptions: companySettings.financingOptions,
    agentTone: companySettings.agentTone,
  };

  const generateCloserReply = async (userText: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAgentResponse(
        'closer',
        [{ role: 'user', content: userText }],
        agentContext
      );
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI response');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerObjection = async (type: 'insurance' | 'price' | 'budget') => {
    setActiveObjection(type);
    setError(null);

    const userMsg = {
      sender: 'User' as const,
      text: objections[type].userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([
      {
        sender: 'AI',
        text: `Hi! We sent over the roof replacement estimate for your review yesterday. I wanted to follow up and see if you had any questions regarding the scope or pricing?`,
        timestamp: 'Yesterday'
      },
      userMsg
    ]);

    const reply = await generateCloserReply(objections[type].userText);
    if (reply) {
      setMessages(prev => [...prev, {
        sender: 'AI',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      syncToCRM(objections[type].userText, reply);
    }
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

      const response = await getAgentResponse('closer', aiMessages, agentContext);

      setMessages(prev => [...prev, {
        sender: 'AI',
        text: response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

      syncToCRM(userMsg.text, response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI response');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-ink">Agent 4: Estimate Follow-Up Agent</h2>
        <p className="text-xs text-ink-mute mt-1">
          Post-inspection estimate follower. Experience how the AI handles complex, high-friction customer objections regarding insurance claims, competitor pricing, and financing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Objection Selections (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card card-hover rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <User className="h-4.5 w-4.5 text-accent-500" /> CRM Target Lead
              </h3>
            </div>
            <p className="text-xs text-ink-mute mt-3 leading-relaxed">
              Choose which estimate-stage lead this follow-up conversation syncs to. Each exchange updates the lead's transcript and workflow status in the CRM Board.
            </p>
            {leadTargets.length > 0 ? (
              <select
                value={targetLeadId}
                onChange={e => setTargetLeadId(e.target.value)}
                className="input-premium text-xs font-medium mt-4"
              >
                {leadTargets.map(lead => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name} ({lead.status})
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-4 space-y-2">
                <label className="label-micro block">
                  No estimate-stage leads yet — enter the homeowner to follow up with
                </label>
                <input
                  type="text"
                  value={coldLeadName}
                  onChange={e => setColdLeadName(e.target.value)}
                  placeholder="Homeowner name (e.g. Dana Whitfield)"
                  className="input-premium text-xs font-medium"
                />
                <p className="text-[10px] text-ink-mute leading-relaxed">
                  This conversation creates a new lead in the CRM (source "Estimate Follow-Up") with the reply's outcome as its status.
                </p>
              </div>
            )}
          </div>

          <div className="glass-card card-hover rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <DollarSign className="h-4.5 w-4.5 text-accent-500" /> Objection Scenarios
              </h3>
              <span className="text-[10px] bg-accent-500/10 text-accent-400 border border-accent-500/20 px-2 py-0.5 rounded font-bold">
                AGENT 4
              </span>
            </div>
            <p className="text-xs text-ink-mute mt-3 leading-relaxed">
              Trigger a typical homeowner sales barrier below to witness the AI Agent's responsive negotiation and objection resolution templates.
            </p>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => handleTriggerObjection('insurance')}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex flex-col space-y-1 ${
                  activeObjection === 'insurance'
                    ? 'bg-accent-500/10 border-accent-500/30 text-accent-400'
                    : 'bg-inset border-line text-ink-mute hover:text-ink'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-widest">Scenario A: Insurance Discrepancy</span>
                <span className="text-[11px] opacity-70">Adjuster denied claim damages or paid insufficient funds.</span>
              </button>

              <button
                onClick={() => handleTriggerObjection('price')}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex flex-col space-y-1 ${
                  activeObjection === 'price'
                    ? 'bg-accent-500/10 border-accent-500/30 text-accent-400'
                    : 'bg-inset border-line text-ink-mute hover:text-ink'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-widest">Scenario B: Competitor Price Match</span>
                <span className="text-[11px] opacity-70">Received a cheaper shingle estimate from a competitor.</span>
              </button>

              <button
                onClick={() => handleTriggerObjection('budget')}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex flex-col space-y-1 ${
                  activeObjection === 'budget'
                    ? 'bg-accent-500/10 border-accent-500/30 text-accent-400'
                    : 'bg-inset border-line text-ink-mute hover:text-ink'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-widest">Scenario C: Deductible / Budget</span>
                <span className="text-[11px] opacity-70">Lacks ready cash for out-of-pocket insurance deductibles.</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Simulation Logs (7 cols) */}
        <div className="lg:col-span-7 glass-card p-6 shadow-xl flex flex-col h-[520px] justify-between">
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2 pb-3 border-b border-line shrink-0">
              <Sparkles className="h-4.5 w-4.5 text-accent-500" /> Interactive Negotiation Panel
            </h3>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto space-y-4 bg-inset p-4 rounded-xl border border-line">
              {messages.map((msg, index) => {
                const isAI = msg.sender === 'AI';
                return (
                  <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                    <div className="flex items-start space-x-2 max-w-md">
                      {isAI && (
                        <div className="h-8 w-8 rounded-lg bg-inset border border-line flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-accent-500" />
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isAI 
                          ? 'chat-bubble-ai rounded-tl-none' 
                          : 'chat-bubble-user rounded-tr-none'
                      }`}>
                        <span className="text-[9px] opacity-40 font-black uppercase tracking-widest block mb-1">
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
                  <span className="text-[10px] text-ink-mute italic">Agent is typing…</span>
                </div>
              )}
              {error && (
                <div className="flex justify-center">
                  <span className="text-[10px] text-danger">{error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Form input reply */}
          <div className="pt-4 border-t border-line shrink-0 space-y-3 mt-4">
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder="Ask custom negotiation/deductible questions..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSend()}
                disabled={isLoading}
                className="flex-1 input-premium px-4 py-2.5 text-xs disabled:opacity-50"
              />
              <button
                onClick={handleCustomSend}
                disabled={isLoading}
                className="btn-accent px-4 py-2.5 rounded-xl text-xs font-black min-h-0 disabled:opacity-50"
              >
                Send Objections
              </button>
            </div>

            <div className="flex justify-between items-center text-[10px]">
              <span className="text-ink-mute flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5 text-accent-500" /> Dedicated post-inspection estimator follow-ups
              </span>
              {savingSuccess && (
                <span className="text-accent-400 font-semibold flex items-center gap-1 animate-fadeIn">
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
