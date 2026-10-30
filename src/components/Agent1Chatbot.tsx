
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Send, Bot, Calendar, Sparkles, User, Phone, Mail } from 'lucide-react';
import { detectLatestIntent, type AgentMessage } from '../lib/agentService';
import { runAgentWithTools } from '../lib/agentRunner';
import { applyActionsToLeads, type AgentAction } from '../lib/applyActions';
import { AgentActivity } from './AgentActivity';
import { extractName, extractZip, deriveRoofIssue } from '../utils/leadExtract';
import {
  validateEmail, validatePhone, validateName, formatPhone,
  findEmailCandidate, findPhoneCandidate, type Checked,
} from '../lib/validators';

const nowStamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Newest candidate decides: a valid one is the value, an invalid one is a
 * "problem" (so the visitor is asked again) and nothing is saved until fixed.
 */
function resolveField(
  texts: string[],
  pick: (t: string) => string | undefined,
  check: (v: string) => Checked,
): { value?: string; problem?: string } {
  for (let i = texts.length - 1; i >= 0; i--) {
    const raw = pick(texts[i]);
    if (!raw) continue;
    const r = check(raw);
    return r.ok ? { value: r.value } : { problem: r.error };
  }
  return {};
}

/** Problems with the contact details inside ONE message the visitor just sent. */
function contactProblems(text: string): string[] {
  const out: string[] = [];
  const email = findEmailCandidate(text);
  if (email) { const r = validateEmail(email); if (!r.ok) out.push(r.error); }
  const phone = findPhoneCandidate(text);
  if (phone) { const r = validatePhone(phone); if (!r.ok) out.push(r.error); }
  return out;
}

export const Agent1Chatbot: React.FC = () => {
  const { companySettings, addLead, leads, setLeads } = useApp();

  const [messages, setMessages] = useState<Array<{ sender: 'AI' | 'User'; text: string; timestamp: string }>>([
    {
      sender: 'AI',
      text: `Hi there! 👋 I'm the RoofFlow AI assistant for ${companySettings.companyName}. Are you seeing any leaks, missing shingles, or storm damage on your roof?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQualified, setHasQualified] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [actionLog, setActionLog] = useState<AgentAction[]>([]);

  // Booking form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [ownership, setOwnership] = useState<'Owner' | 'Renter'>('Owner');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  const scrollRef = useRef<HTMLDivElement>(null);

  const quickReplies = [
    "Yes, my roof has hail damage",
    "How much does an inspection cost?",
    "Do you work with insurance?",
    "I want to schedule a free inspection"
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, showBookingForm]);

  // ---- Free-form lead capture ------------------------------------------------
  // Scan ONLY the visitor's own messages for contact details. As soon as the
  // conversation yields a name AND a phone AND an email, the lead is captured
  // to the CRM with status 'New Lead' — no form required. Extraction runs on
  // user text only, so it behaves identically on the live-AI path and the local
  // fallback engine. capturedRef makes it strictly once-per-conversation.
  const capturedRef = useRef(false);

  const extracted = useMemo(() => {
    const userTexts = messages.filter(m => m.sender === 'User').map(m => m.text);
    const joined = userTexts.join('\n');
    const email = resolveField(userTexts, findEmailCandidate, validateEmail);
    const phone = resolveField(userTexts, findPhoneCandidate, validatePhone);
    const name = resolveField(userTexts, extractName, validateName);
    return {
      email: email.value,
      phone: phone.value ? formatPhone(phone.value) : undefined,
      name: name.value,
      zip: extractZip(joined),
      roofIssue: userTexts.map(t => deriveRoofIssue(t)).find(Boolean),
    };
  }, [messages]);

  useEffect(() => {
    if (capturedRef.current || showBookingForm) return;
    if (extracted.email && extracted.phone && extracted.name) {
      capturedRef.current = true;
      const saved = addLead({
        name: extracted.name,
        phone: extracted.phone,
        email: extracted.email,
        propertyOwnership: 'Owner',
        status: 'New Lead',
        agentType: 'Chatbot',
        zipCode: extracted.zip,
        roofIssue: extracted.roofIssue,
        chatLog: messages.map(m => ({
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
        })),
      }, { validate: true });
      if (!saved.ok) { capturedRef.current = false; return; }
      setMessages(prev => [...prev, {
        sender: 'AI',
        text: `Got it, ${extracted.name} — I've saved your details and a specialist will reach out at ${extracted.phone}. Would you like me to book your free inspection now?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracted, showBookingForm]);

  // Prefill the booking form with anything the visitor already typed.
  useEffect(() => {
    if (showBookingForm) {
      if (extracted.name && !name) setName(extracted.name);
      if (extracted.phone && !phone) setPhone(extracted.phone);
      if (extracted.email && !email) setEmail(extracted.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBookingForm]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg = {
      sender: 'User' as const,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Bad contact details? Ask again right here: no AI call, nothing is saved.
    const problems = contactProblems(text);
    if (problems.length > 0) {
      setMessages([...messages, userMsg, {
        sender: 'AI' as const,
        text: `${problems.join(' ')} Could you type it again?`,
        timestamp: nowStamp(),
      }]);
      setInputText('');
      return;
    }

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

      const { reply, actions } = await runAgentWithTools('chatbot', aiMessages, {
        companyName: companySettings.companyName,
        city: companySettings.city,
        stormEvent: companySettings.stormName,
        stormDate: companySettings.stormDate,
        financingOptions: companySettings.financingOptions,
        agentTone: companySettings.agentTone,
      });

      if (actions.length > 0) {
        setActionLog(prev => [...prev, ...actions]);
        setLeads(prev => applyActionsToLeads(prev, actions));
      }
      const booked = actions.some(a => a.tool === 'book_inspection' && a.result.ok);

      setMessages(prev => [...prev, {
        sender: 'AI',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

      // Open the booking form when the visitor's latest message signals booking intent
      // (schedule detection from the same intent engine that drives the reply).
      if (!booked && detectLatestIntent(aiMessages) === 'schedule') {
        setShowBookingForm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookingSubmit = () => {
    setFormError(null);
    const n = validateName(name);
    const p = validatePhone(phone);
    const e = validateEmail(email);
    if (!n.ok || !p.ok || !e.ok) {
      setFieldErrors({
        name: n.ok ? undefined : n.error,
        phone: p.ok ? undefined : p.error,
        email: e.ok ? undefined : e.error,
      });
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setFieldErrors({});
    const cleanName = n.value;
    const cleanPhone = formatPhone(p.value);
    const cleanEmail = e.value;

    const scheduledDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + ' 10:00 AM';
    const chatLog = messages.map(m => ({
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp,
    }));

    // If the free-form capture already saved this contact (same phone), UPDATE
    // that lead to booked instead of creating a duplicate.
    const existing = leads.find(l => l.phone.replace(/\D/g, '') === p.value);
    if (existing) {
      setLeads(prev => prev.map(l =>
        l.id === existing.id
          ? { ...l, status: 'Inspection Scheduled', scheduledDate, propertyOwnership: ownership, appointmentDetails: { date: scheduledDate.split(' ')[0], time: '10:00 AM', notes: 'Booked via Agent 1 chat.' } }
          : l
      ));
    } else {
      addLead({
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        propertyOwnership: ownership,
        status: 'Inspection Scheduled',
        agentType: 'Chatbot',
        scheduledDate,
        chatLog,
      }, { validate: true });
    }

    setMessages(prev => [...prev, {
      sender: 'AI',
      text: `Thanks, ${cleanName}! Your free inspection request has been submitted. Our team will confirm your appointment shortly.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setShowBookingForm(false);
    setHasQualified(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Agent 1: Website Lead Capture Chatbot</h2>
        <p className="text-xs text-slate-400 mt-1">
          Real AI-powered chat. Ask anything about storm damage, insurance, or inspections — the assistant responds live and hands off to a booking form when you're ready to schedule.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Chat Interface (7 cols) */}
        <div className="lg:col-span-7 glass rounded-2xl overflow-hidden shadow-xl flex flex-col h-[560px]">
          {/* Top Chat Header */}
          <div className="bg-slate-950/60 px-6 py-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="bg-orange-500/10 p-2 rounded-lg relative">
                <Bot className="h-5 w-5 text-orange-500" />
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 border border-slate-900"></span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">RoofFlow Virtual Specialist</h3>
                <p className="text-[10px] text-slate-400">AI Assistant • Online 24/7</p>
              </div>
            </div>
            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-bold font-mono">
              AGENT 1
            </span>
          </div>

          {/* Chat Messages Log */}
          <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-950/40 premium-scroll">
            {messages.map((msg, index) => {
              const isAI = msg.sender === 'AI';
              return (
                <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                  <div className="flex items-start space-x-2.5 max-w-md">
                    {isAI && (
                      <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-orange-500" />
                      </div>
                    )}
                    <div className={`px-4 py-2.5 text-xs leading-relaxed ${
                      isAI
                        ? 'chat-bubble-ai rounded-tl-none'
                        : 'chat-bubble-user rounded-tr-none'
                    }`}>
                      <p>{msg.text}</p>
                      <span className="text-[9px] opacity-40 block text-right mt-1.5 font-mono">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start animate-slideUp">
                <div className="flex items-start space-x-2.5">
                  <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">{error}</span>
              </div>
            )}

            {/* Inline booking form, shown when the AI signals booking intent */}
            {showBookingForm && (
              <div className="bg-slate-900/80 backdrop-blur-md border border-accent-500/30 rounded-xl p-4 space-y-3 animate-slideUp">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-orange-500" /> Book Your Free Inspection
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <User className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Full name"
                      autoComplete="name"
                      aria-invalid={Boolean(fieldErrors.name)}
                      className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
                    />
                  </div>
                  {fieldErrors.name && <p role="alert" className="text-[10px] text-red-400 -mt-1">{fieldErrors.name}</p>}
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <Phone className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Phone number (10+ digits)"
                      inputMode="tel"
                      autoComplete="tel"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
                    />
                  </div>
                  {fieldErrors.phone && <p role="alert" className="text-[10px] text-red-400 -mt-1">{fieldErrors.phone}</p>}
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <Mail className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Email address"
                      inputMode="email"
                      autoComplete="email"
                      aria-invalid={Boolean(fieldErrors.email)}
                      className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
                    />
                  </div>
                  {fieldErrors.email && <p role="alert" className="text-[10px] text-red-400 -mt-1">{fieldErrors.email}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOwnership('Owner')}
                      className={`flex-1 text-[11px] font-bold py-2 rounded-lg border transition ${ownership === 'Owner' ? 'bg-accent-500 text-slate-950 border-accent-400' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      I own the home
                    </button>
                    <button
                      onClick={() => setOwnership('Renter')}
                      className={`flex-1 text-[11px] font-bold py-2 rounded-lg border transition ${ownership === 'Renter' ? 'bg-accent-500 text-slate-950 border-accent-400' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      I rent
                    </button>
                  </div>
                </div>
                {formError && <p className="text-[10px] text-red-400">{formError}</p>}
                <button
                  onClick={handleBookingSubmit}
                  className="w-full btn-accent text-xs py-3"
                >
                  Confirm Free Inspection Request
                </button>
              </div>
            )}
          </div>

          {/* Quick Replies Buttons */}
          {!showBookingForm && (
            <div className="p-4 border-t border-slate-800/60 bg-[#0f172a]/40 overflow-x-auto whitespace-nowrap space-x-2 scrollbar-none flex shrink-0">
              {quickReplies.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(reply)}
                  disabled={isLoading}
                  className="bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[11px] text-slate-300 px-3.5 py-2.5 rounded-full transition shrink-0 disabled:opacity-50"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <div className="p-4 bg-slate-900/60 border-t border-slate-800 flex items-center space-x-3 shrink-0">
            <input
              type="text"
              placeholder="Ask anything about storm damage or inspections..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend(inputText)}
              disabled={isLoading || showBookingForm}
              className="flex-1 input-premium disabled:opacity-50"
            />
            <button
              onClick={() => handleSend(inputText)}
              disabled={isLoading || showBookingForm}
              className="btn-accent p-3 rounded-xl shrink-0 disabled:opacity-50 min-h-0"
            >
              <Send className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Sidebar Simulator explanation (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass card-hover rounded-2xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sparkles className="h-4.5 w-4.5 text-accent-400" /> How This Works
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              This is a live AI assistant, not a scripted demo. It answers freely using your company info, and hands off to a real booking form once a visitor is ready to schedule.
            </p>
            <div className="mt-4 space-y-3.5 text-xs text-slate-300">
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">1</div>
                <div>
                  <p className="font-bold text-white">Live AI Conversation</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Every reply is generated fresh — try asking something unusual.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">2</div>
                <div>
                  <p className="font-bold text-white">Booking Handoff</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">When the AI senses booking intent, it opens a real form instead of guessing your contact details from chat text.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">3</div>
                <div>
                  <p className="font-bold text-white">CRM Sync</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Submitted leads (with the full chat transcript) save straight to the CRM Board.</p>
                </div>
              </div>
            </div>
          </div>

          {hasQualified && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl flex items-start space-x-3 animate-fadeIn">
              <Calendar className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">Lead Transferred to CRM!</h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Check the <strong>CRM Leads Board</strong> tab to view the live dashboard profile and chat transcript.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AgentActivity actions={actionLog} />
    </div>
  );
};
