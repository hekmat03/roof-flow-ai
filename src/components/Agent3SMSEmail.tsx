import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquarePlus, Mail, Clock, Send, Play, Sparkles, Smartphone, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getAgentResponse, AgentMessage } from '../lib/agentService';

export const Agent3SMSEmail: React.FC = () => {
  const { companySettings, leads, setLeads } = useApp();
  
  // Selection/Simulation states
  const [selectedDay, setSelectedDay] = useState<1 | 2 | 4 | 7>(1);
  const [simulatedLead, setSimulatedLead] = useState<string>('Michael Miller');
  const [simulationActive, setSimulationActive] = useState(false);
  const [userReplyText, setUserReplyText] = useState('');
  const [simulationLogs, setSimulationLogs] = useState<Array<{ sender: 'AI' | 'User' | 'System'; text: string; timestamp: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campaign templates data
  const templates = {
    1: {
      sms: `Hi {{name}}, this is ${companySettings.companyName}. We saw you requested a roof inspection in {{city}} but haven’t booked a slot. Our specialists can check it for free tomorrow! Do you have 5 minutes?`,
      emailSubject: `Urgent: Storm Inspection Deadline for {{name}}`,
      emailBody: `Hi {{name}},\n\nWe noticed you visited our web assistant regarding recent storm damage from the ${companySettings.stormName}, but haven't scheduled your FREE inspection yet.\n\nMost homeowners don't realize insurance policies have strict filing deadlines (often 12 months from the storm event on ${companySettings.stormDate}). We provide a full digital photo report and help guide you through claims.\n\nWould you like us to inspect your roof for leaks this week?\n\nBest regards,\n${companySettings.companyName} Team`
    },
    2: {
      sms: `Hey {{name}}, ${companySettings.companyName} here. Storm damage from ${companySettings.stormDate} can lead to mold and ceiling stains if left unchecked. Should we send a drone inspector out tomorrow? 100% free.`,
      emailSubject: `Mold & Structural Rot after ${companySettings.stormName}`,
      emailBody: `Hi {{name}},\n\nHail damage can be deceptive. Even if shingles look fine from the ground, severe impacts break the fiberglass backing, which guarantees leak issues next winter.\n\nOur specialists in {{city}} are offering free digital inspections to prevent costly structure mold.\n\nDo you have 5 minutes this Thursday for a brief check?\n\nSincerely,\n${companySettings.companyName}`
    },
    4: {
      sms: `Hi {{name}}, we have a tech near {{city}} this Friday. We can check your roof for leaks in 15 mins while you are at work. No need to be home! Can we grab your address?`,
      emailSubject: `Drone Inspection - No Need to Be Home`,
      emailBody: `Hi {{name}},\n\nWe know you are busy. That's why ${companySettings.companyName} offers contact-free drone inspections.\n\nOur technician can scan your roof and send a complete damage damage report directly to your email without you needing to take off work.\n\nIs this Friday morning a good time for us to stop by?\n\nBest,\n${companySettings.companyName}`
    },
    7: {
      sms: `Hey {{name}}, last try! Insurance filing limit for the ${companySettings.stormName} is approaching. Let us inspect it for free before your claim eligibility expires. Reply YES to book.`,
      emailSubject: `Last Notice: Claim Eligibility Deadline`,
      emailBody: `Hi {{name}},\n\nThis is our final follow-up. Insurance claim limits are strict, and we want to ensure your roof is protected before the deadline.\n\nIf you would like to safeguard your property value with a free inspection report, please reply to this email or call us today.\n\nThank you,\n${companySettings.companyName}`
    }
  };

  const getRenderedTemplate = (day: 1 | 2 | 4 | 7, type: 'sms' | 'emailSubject' | 'emailBody', name: string) => {
    const text = templates[day][type];
    return text
      .replace(/{{name}}/g, name)
      .replace(/{{city}}/g, companySettings.city);
  };

  const handleStartSequenceSim = () => {
    setSimulationActive(true);
    setError(null);
    setSimulationLogs([
      { sender: 'System', text: `Triggering Day ${selectedDay} Sequence for ${simulatedLead}...`, timestamp: new Date().toLocaleTimeString() },
      { sender: 'AI', text: getRenderedTemplate(selectedDay, 'sms', simulatedLead), timestamp: new Date().toLocaleTimeString() }
    ]);
  };

  const handleUserReply = async () => {
    if (!userReplyText.trim() || isLoading) return;

    const userReply = {
      sender: 'User' as const,
      text: userReplyText,
      timestamp: new Date().toLocaleTimeString()
    };

    const updatedLogs = [...simulationLogs, userReply];
    setSimulationLogs(updatedLogs);
    setUserReplyText('');
    setIsLoading(true);
    setError(null);

    try {
      // Build the message history for the AI (skip the "System" trigger line)
      const aiMessages: AgentMessage[] = updatedLogs
        .filter(l => l.sender !== 'System')
        .map(l => ({ role: l.sender === 'AI' ? 'assistant' : 'user', content: l.text }));

      const aiResponseText = await getAgentResponse('nurturer', aiMessages, {
        companyName: companySettings.companyName,
        city: companySettings.city,
        stormEvent: companySettings.stormName,
        leadName: simulatedLead,
      });

      setSimulationLogs(prev => [...prev, {
        sender: 'AI',
        text: aiResponseText,
        timestamp: new Date().toLocaleTimeString()
      }]);

      // Sync sequence results with the CRM leads list if the lead exists
      setLeads(prev => prev.map(lead => {
        if (lead.name === simulatedLead) {
          return {
            ...lead,
            status: 'In Contact',
            chatLog: [
              ...lead.chatLog,
              { sender: 'System', text: `Day ${selectedDay} sequence triggered. Reply received.`, timestamp: new Date().toLocaleString() },
              { sender: 'AI', text: getRenderedTemplate(selectedDay, 'sms', simulatedLead), timestamp: new Date().toLocaleString() },
              { sender: 'User', text: userReplyText, timestamp: new Date().toLocaleString() },
              { sender: 'AI', text: aiResponseText, timestamp: new Date().toLocaleString() }
            ]
          };
        }
        return lead;
      }));
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
        <h2 className="text-2xl font-black text-white">Agent 3: Follow-Up & Nurture SMS/Email</h2>
        <p className="text-xs text-slate-400 mt-1">
          A multi-day follow-up campaign that nurtures leads who did not schedule inspections immediately. The sequence reacts to replies dynamically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Sequence Timelines (7 cols) */}
        <div className="lg:col-span-7 bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-orange-500" /> Automated Sequence Timeline
            </h3>
            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-bold font-mono">
              AGENT 3
            </span>
          </div>

          {/* Timeline Tab selector */}
          <div className="grid grid-cols-4 gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800/80">
            {([1, 2, 4, 7] as const).map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  selectedDay === day
                    ? 'bg-orange-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Day {day}
              </button>
            ))}
          </div>

          {/* Templates Display cards */}
          <div className="space-y-4">
            {/* SMS View card */}
            <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <span className="text-[9px] text-slate-500 block font-bold uppercase tracking-wider">Simulated Day {selectedDay} SMS Outline</span>
              <p className="text-slate-200 text-xs font-mono bg-slate-900/80 p-3 rounded-lg border border-slate-850">
                {getRenderedTemplate(selectedDay, 'sms', simulatedLead)}
              </p>
            </div>

            {/* Email View card */}
            <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="border-b border-slate-800/50 pb-2">
                <span className="text-[9px] text-slate-500 block font-bold uppercase tracking-wider">Simulated Day {selectedDay} Email Subject</span>
                <p className="text-white text-xs font-bold mt-1">
                  {getRenderedTemplate(selectedDay, 'emailSubject', simulatedLead)}
                </p>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block font-bold uppercase tracking-wider">Email Content Body</span>
                <pre className="text-slate-300 text-[11px] font-sans whitespace-pre-wrap leading-relaxed mt-1.5 bg-slate-900/80 p-3 rounded-lg border border-slate-850 max-h-[180px] overflow-y-auto">
                  {getRenderedTemplate(selectedDay, 'emailBody', simulatedLead)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Nurture Trigger Playground (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between h-[520px]">
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800 shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-orange-500" /> Sequence Trigger Simulator
              </h3>

              {!simulationActive ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4">
                  <Smartphone className="h-12 w-12 text-slate-600 animate-pulse" />
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-white">Trigger Sequences for CRM Leads</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs">
                      Pick a cold lead from our CRM list and trigger the automated multi-channel sequence to view the interactive follow-up chat logs.
                    </p>
                  </div>
                  
                  {/* Select Lead dropdown */}
                  <div className="w-full max-w-xs text-left">
                    <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">Target CRM Recipient</label>
                    <select
                      value={simulatedLead}
                      onChange={e => setSimulatedLead(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-medium"
                    >
                      <option value="Michael Miller">Michael Miller (Unscheduled Lead)</option>
                      <option value="Sarah Jenkins">Sarah Jenkins (Scheduled Lead)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleStartSequenceSim}
                    className="bg-orange-500 hover:bg-orange-600 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-orange-500/20 transition flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5 fill-slate-950" />
                    Launch Sequence
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  {/* Active Simulation logs */}
                  <div className="flex-1 overflow-y-auto space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-850 max-h-[280px]">
                    {simulationLogs.map((log, index) => {
                      const isSystem = log.sender === 'System';
                      const isAI = log.sender === 'AI';
                      
                      if (isSystem) {
                        return (
                          <div key={index} className="flex justify-center">
                            <span className="bg-slate-800/80 text-[9px] font-bold text-slate-400 px-2.5 py-1 rounded-md font-mono">
                              {log.text}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                          <div className={`max-w-xs rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                            isAI 
                              ? 'bg-slate-850 text-slate-100 border border-slate-750 rounded-tl-none' 
                              : 'bg-orange-500 text-slate-950 font-bold rounded-tr-none'
                          }`}>
                            <p>{log.text}</p>
                          </div>
                        </div>
                      );
                    })}
                    {isLoading && (
                      <div className="flex justify-start">
                        <span className="text-[10px] text-slate-500 italic">AI is typing…</span>
                      </div>
                    )}
                    {error && (
                      <div className="flex justify-center">
                        <span className="text-[10px] text-red-400">{error}</span>
                      </div>
                    )}
                  </div>

                  {/* Form response reply input */}
                  <div className="pt-4 border-t border-slate-800 shrink-0 space-y-3">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Type homeower reply (e.g. 'Yes, I am free tomorrow')"
                        value={userReplyText}
                        onChange={e => setUserReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUserReply()}
                        disabled={isLoading}
                        className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                      />
                      <button
                        onClick={handleUserReply}
                        disabled={isLoading}
                        className="bg-orange-500 hover:bg-orange-600 px-4 rounded-xl text-slate-950 text-xs font-bold transition disabled:opacity-50"
                      >
                        <Send className="h-4 w-4 stroke-[2.5]" />
                      </button>
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Synchronized with CRM
                      </span>
                      <button 
                        onClick={() => setSimulationActive(false)}
                        className="text-slate-400 hover:text-white underline font-semibold"
                      >
                        Reset Simulator
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
