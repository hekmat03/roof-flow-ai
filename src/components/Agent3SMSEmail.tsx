import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquarePlus, Mail, Clock, Send, Play, Sparkles, Smartphone, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getAgentResponse, detectLatestIntent, type AgentMessage } from '../lib/agentService';
import { extractEmail, extractPhone, extractZip, deriveRoofIssue } from '../utils/leadExtract';

export const Agent3SMSEmail: React.FC = () => {
  const { companySettings, leads, setLeads, addLead } = useApp();
  const [selectedDay, setSelectedDay] = useState<1 | 2 | 4 | 7>(1);

  const coldStatuses = ['New Lead', 'Contacted', 'In Contact', 'Follow-up Nurture'];
  const targetableLeads = leads.filter(l => coldStatuses.includes(l.status));
  const selectorLeads = targetableLeads.length > 0 ? targetableLeads : leads;

  const [simulatedLead, setSimulatedLead] = useState<string>(() => leads[0]?.name || '');
  const [simulationActive, setSimulationActive] = useState(false);

  useEffect(() => {
    if (selectorLeads.length > 0 && !selectorLeads.some(l => l.name === simulatedLead)) {
      setSimulatedLead(selectorLeads[0].name);
    }
  }, [selectorLeads, simulatedLead]);

  const [userReplyText, setUserReplyText] = useState('');
  const [simulationLogs, setSimulationLogs] = useState<Array<{ sender: 'AI' | 'User' | 'System'; text: string; timestamp: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      emailBody: `Hi {{name}},\n\nWe know you are busy. That's why ${companySettings.companyName} offers contact-free drone inspections.\n\nOur technician can scan your roof and send a complete damage report directly to your email without you needing to take off work.\n\nIs this Friday morning a good time for us to stop by?\n\nBest,\n${companySettings.companyName}`
    },
    7: {
      sms: `Hey {{name}}, last try! Insurance filing limit for the ${companySettings.stormName} is approaching. Let us inspect it for free before your claim eligibility expires. Reply YES to book.`,
      emailSubject: `Last Notice: Claim Eligibility Deadline`,
      emailBody: `Hi {{name}},\n\nThis is our final follow-up. Insurance claim limits are strict, and we want to ensure your roof is protected before the deadline.\n\nIf you would like to safeguard your property value with a free inspection report, please reply to this email or call us today.\n\nThank you,\n${companySettings.companyName}`
    }
  };

  const getRenderedTemplate = (day: 1 | 2 | 4 | 7, type: 'sms' | 'emailSubject' | 'emailBody', name: string) => {
    const text = templates[day][type];
    return text.replace(/{{name}}/g, name).replace(/{{city}}/g, companySettings.city);
  };

  const handleStartSequenceSim = () => {
    if (!simulatedLead.trim()) return;
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
      const aiMessages: AgentMessage[] = updatedLogs
        .filter(l => l.sender !== 'System')
        .map(l => ({ role: l.sender === 'AI' ? 'assistant' : 'user', content: l.text }));

      const aiResponseText = await getAgentResponse('nurturer', aiMessages, {
        companyName: companySettings.companyName,
        city: companySettings.city,
        stormEvent: companySettings.stormName,
        stormDate: companySettings.stormDate,
        leadName: simulatedLead,
        financingOptions: companySettings.financingOptions,
        agentTone: companySettings.agentTone,
      });

      setSimulationLogs(prev => [...prev, {
        sender: 'AI',
        text: aiResponseText,
        timestamp: new Date().toLocaleTimeString()
      }]);

      const intent = detectLatestIntent(aiMessages);
      const converted = intent === 'yes' || intent === 'schedule' || intent === 'scheduleask';
      const nextStatus = converted ? 'Inspection Scheduled' : 'In Contact';
      const scheduledDate = converted
        ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + ' 10:00 AM'
        : undefined;

      const sequenceLog = [
        { sender: 'System' as const, text: `Day ${selectedDay} sequence triggered. Reply received.`, timestamp: new Date().toLocaleString() },
        { sender: 'AI' as const, text: getRenderedTemplate(selectedDay, 'sms', simulatedLead), timestamp: new Date().toLocaleString() },
        { sender: 'User' as const, text: userReplyText, timestamp: new Date().toLocaleString() },
        { sender: 'AI' as const, text: aiResponseText, timestamp: new Date().toLocaleString() },
      ];

      const existingLead = leads.find(l => l.name === simulatedLead);
      if (existingLead) {
        setLeads(prev => prev.map(lead => {
          if (lead.name !== simulatedLead) return lead;
          return {
            ...lead,
            status: nextStatus,
            scheduledDate: scheduledDate ?? lead.scheduledDate,
            chatLog: [...lead.chatLog, ...sequenceLog],
          };
        }));
      } else if (simulatedLead.trim()) {
        addLead({
          name: simulatedLead.trim(),
          phone: extractPhone(userReplyText) || 'N/A',
          email: extractEmail(userReplyText) || 'N/A',
          propertyOwnership: 'Owner',
          status: nextStatus,
          agentType: 'SMS Nurture',
          scheduledDate,
          zipCode: extractZip(userReplyText),
          roofIssue: deriveRoofIssue(updatedLogs.map(l => l.text).join(' ')),
          chatLog: sequenceLog,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI response');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 agent-workspace agent-nurture">
      <div>
        <h2 className="text-2xl font-black text-ink">Agent 3: Follow-Up & Nurture SMS/Email</h2>
        <p className="text-xs text-ink-mute mt-1">
          A multi-day follow-up campaign that nurtures leads who did not schedule inspections immediately. The sequence reacts to replies dynamically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 glass rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-gold" /> Automated Sequence Timeline
            </h3>
            <span className="text-[10px] bg-gold/10 text-gold border border-gold/20 px-2 py-0.5 rounded font-bold font-mono">
              AGENT 3
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 bg-card p-1.5 rounded-xl border border-line/80">
            {([1, 2, 4, 7] as const).map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  selectedDay === day
                    ? 'bg-gold text-gold-ink shadow-md'
                    : 'text-ink-mute hover:text-ink'
                }`}
              >
                Day {day}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div className="bg-page/60 border border-line rounded-xl p-4 space-y-2">
              <span className="text-[9px] text-ink-mute block font-bold uppercase tracking-wider">Simulated Day {selectedDay} SMS Outline</span>
              <p className="text-ink text-xs font-mono bg-card/80 p-3 rounded-lg border border-line">
                {getRenderedTemplate(selectedDay, 'sms', simulatedLead)}
              </p>
            </div>

            <div className="bg-page/60 border border-line rounded-xl p-4 space-y-3">
              <div className="border-b border-line/50 pb-2">
                <span className="text-[9px] text-ink-mute block font-bold uppercase tracking-wider">Simulated Day {selectedDay} Email Subject</span>
                <p className="text-ink text-xs font-bold mt-1">
                  {getRenderedTemplate(selectedDay, 'emailSubject', simulatedLead)}
                </p>
              </div>
              <div>
                <span className="text-[9px] text-ink-mute block font-bold uppercase tracking-wider">Email Content Body</span>
                <pre className="text-ink-soft text-[11px] font-sans whitespace-pre-wrap leading-relaxed mt-1.5 bg-card/80 p-3 rounded-lg border border-line max-h-[180px] overflow-y-auto">
                  {getRenderedTemplate(selectedDay, 'emailBody', simulatedLead)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="glass card-hover rounded-2xl p-6 flex flex-col justify-between h-[520px]">
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-line shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-gold" /> Sequence Trigger Simulator
              </h3>

              {!simulationActive ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4">
                  <Smartphone className="h-12 w-12 text-ink-mute animate-pulse" />
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-ink">Trigger Sequences for CRM Leads</h4>
                    <p className="text-[11px] text-ink-mute leading-relaxed max-w-xs">
                      Pick a cold lead from our CRM list and trigger the automated multi-channel sequence to view the interactive follow-up chat logs.
                    </p>
                  </div>

                  <div className="w-full max-w-xs text-left">
                    <label className="text-[10px] text-ink-mute block mb-1.5 font-bold uppercase tracking-wider">Target CRM Recipient</label>
                    {selectorLeads.length > 0 ? (
                      <select
                        value={simulatedLead}
                        onChange={e => setSimulatedLead(e.target.value)}
                        className="input-premium text-xs font-medium"
                      >
                        {selectorLeads.map(lead => (
                          <option key={lead.id} value={lead.name}>
                            {lead.name} ({lead.status})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={simulatedLead}
                          onChange={e => setSimulatedLead(e.target.value)}
                          placeholder="Cold lead name (e.g. Chris Nolan)"
                          className="input-premium text-xs font-medium w-full"
                        />
                        <p className="text-[11px] text-ink-mute italic leading-relaxed">
                          No leads in the CRM yet — type a name to simulate a cold lead; their first
                          reply is captured as a real lead in the CRM.
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleStartSequenceSim}
                    disabled={!simulatedLead.trim()}
                    className="btn-accent px-5 py-2.5 text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play className="h-3.5 w-3.5 fill-page" />
                    Launch Sequence
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div className="flex-1 overflow-y-auto space-y-3 bg-card/60 p-4 rounded-xl border border-line max-h-[280px]">
                    {simulationLogs.map((log, index) => {
                      const isSystem = log.sender === 'System';
                      const isAI = log.sender === 'AI';

                      if (isSystem) {
                        return (
                          <div key={index} className="flex justify-center">
                            <span className="bg-inset/80 text-[9px] font-bold text-ink-mute px-2.5 py-1 rounded-md font-mono">
                              {log.text}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                          <div className={`max-w-xs rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                            isAI
                              ? 'bg-inset text-ink border border-line rounded-tl-none'
                              : 'chat-bubble-user rounded-tr-none'
                          }`}>
                            <p>{log.text}</p>
                          </div>
                        </div>
                      );
                    })}
                    {isLoading && (
                      <div className="flex justify-start">
                        <span className="text-[10px] text-ink-mute italic">AI is typing…</span>
                      </div>
                    )}
                    {error && (
                      <div className="flex justify-center">
                        <span className="text-[10px] text-danger">{error}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-line shrink-0 space-y-3">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Type homeower reply (e.g. 'Yes, I am free tomorrow')"
                        value={userReplyText}
                        onChange={e => setUserReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUserReply()}
                        disabled={isLoading}
                        className="flex-1 input-premium px-3 py-2 text-xs disabled:opacity-50"
                      />
                      <button
                        onClick={handleUserReply}
                        disabled={isLoading}
                        className="btn-accent px-4 rounded-xl text-xs font-bold min-h-0 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4 stroke-[2.5]" />
                      </button>
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-accent-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Synchronized with CRM
                      </span>
                      <button
                        onClick={() => setSimulationActive(false)}
                        className="text-ink-mute hover:text-ink underline font-semibold"
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
