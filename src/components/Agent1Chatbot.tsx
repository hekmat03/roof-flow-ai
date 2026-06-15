import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Send, Bot, Calendar, Sparkles } from 'lucide-react';

export const Agent1Chatbot: React.FC = () => {
  const { companySettings, addLead } = useApp();
  
  // Interactive Chat State
  const [messages, setMessages] = useState<Array<{ sender: 'AI' | 'User'; text: string; timestamp: string }>>([
    { sender: 'AI', text: `Hi there! 👋 I am the RoofFlow AI assistant for ${companySettings.companyName}. Are you seeing any leaks, missing shingles, or storm damage on your roof?`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [inputText, setInputText] = useState('');
  const [hasQualified, setHasQualified] = useState(false);
  const [step, setStep] = useState(0); // Conversation flow state

  // Qualification Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [ownership, setOwnership] = useState<'Owner' | 'Renter'>('Owner');

  // Interactive Quick Reply options
  const quickReplies = [
    "Yes, my roof has hail damage",
    "How much does an inspection cost?",
    "Do you work with insurance?",
    "I want to schedule a free inspection"
  ];

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    
    const userMsg = {
      sender: 'User' as const,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    // Simulated Bot Responses based on steps/queries
    setTimeout(() => {
      let aiText = '';
      const lower = text.toLowerCase();

      if (lower.includes('hail') || lower.includes('damage') || lower.includes('yes')) {
        aiText = `I am so sorry to hear your home was hit. The recent ${companySettings.stormName} on ${companySettings.stormDate} caused serious hail damage across our community. We are providing 100% FREE professional roof inspections to help homeowners file timely claims. Are you the homeowner of the property?`;
        setStep(1);
      } else if (lower.includes('cost') || lower.includes('free') || lower.includes('inspection')) {
        aiText = "Our professional roof inspection is 100% free with absolutely zero obligation! We provide a full digital photo report detailing any hail impacts or leaks. Are you the homeowner of the property?";
        setStep(1);
      } else if (lower.includes('insurance')) {
        aiText = "Yes, absolutely! We assist with the entire insurance claim process, providing documentation, photos, and meet directly with insurance adjusters. Are you the owner of the property?";
        setStep(1);
      } else if (step === 1) {
        if (lower.includes('yes') || lower.includes('owner')) {
          aiText = "Perfect! Because of active storm damage limits, we recommend inspecting it right away. What is your full name so I can create your free inspection file?";
          setOwnership('Owner');
          setStep(2);
        } else {
          aiText = "Got it. Usually, we need the homeowner's authorization to schedule our inspectors, but we can still answer general questions! What is your full name?";
          setOwnership('Renter');
          setStep(2);
        }
      } else if (step === 2) {
        setName(text);
        aiText = `Nice to meet you, ${text}! What is the best phone number and email address to reach you at?`;
        setStep(3);
      } else if (step === 3) {
        // Simple regex or parse phone/email
        setPhone(text);
        setEmail('info@roof-flow-ai-demo.com');
        aiText = `Thank you! I've created your lead profile in our system. Let's schedule your FREE inspection. We have openings this week! Would you like me to book it now?`;
        setStep(4);
      } else if (step === 4) {
        aiText = `Awesome! I've automatically booked your FREE roof inspection for next Monday at 10:00 AM. Our lead specialist will call you shortly to confirm! Is there anything else I can assist you with today?`;
        setHasQualified(true);
        
        // Save to CRM State
        addLead({
          name: name || 'Demo Lead',
          phone: phone || text || '(214) 555-9011',
          email: email || 'sample.owner@gmail.com',
          propertyOwnership: ownership,
          status: 'Inspection Scheduled',
          agentType: 'Chatbot',
          scheduledDate: new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0] + ' 10:00 AM',
          chatLog: [
            ...messages,
            userMsg,
            { sender: 'AI', text: 'Scheduled inspection and qualified homeowner.', timestamp: new Date().toLocaleTimeString() }
          ]
        });
      } else {
        aiText = "I appreciate that info! To schedule your free inspection, please let me know if you own the home or what type of damage you noticed.";
      }

      setMessages(prev => [...prev, {
        sender: 'AI',
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

    }, 1000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Agent 1: Website Lead Capture Chatbot</h2>
        <p className="text-xs text-slate-400 mt-1">
          Simulate a homeowner visiting the company website. The AI Chatbot automatically engages, handles storm objections, and qualifies ownership.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Chat Interface (7 cols) */}
        <div className="lg:col-span-7 bg-[#1e293b] border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[520px]">
          {/* Top Chat Header */}
          <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
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
          <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#0f172a]/60">
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
                    <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      isAI 
                        ? 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none' 
                        : 'bg-orange-500 text-slate-950 font-bold rounded-tr-none'
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
          </div>

          {/* Quick Replies Buttons */}
          <div className="p-4 border-t border-slate-800/60 bg-[#0f172a]/40 overflow-x-auto whitespace-nowrap space-x-2 scrollbar-none flex shrink-0">
            {quickReplies.map((reply, i) => (
              <button
                key={i}
                onClick={() => handleSend(reply)}
                className="bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[11px] text-slate-300 px-3.5 py-1.5 rounded-full transition shrink-0"
              >
                {reply}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <div className="p-4 bg-slate-900/60 border-t border-slate-800 flex items-center space-x-3 shrink-0">
            <input
              type="text"
              placeholder="Ask anything about storm damage or inspections..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend(inputText)}
              className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-orange-500"
            />
            <button
              onClick={() => handleSend(inputText)}
              className="bg-orange-500 hover:bg-orange-600 p-3 rounded-xl text-slate-950 shadow-lg shadow-orange-500/10 transition shrink-0"
            >
              <Send className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Sidebar Simulator explanation (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sparkles className="h-4.5 w-4.5 text-orange-500" /> Lead Qualification Logic
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              This simulator guides users through Agent 1's automated sales script designed specifically for storm roofing campaigns.
            </p>
            <div className="mt-4 space-y-3.5 text-xs text-slate-300">
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">STEP 1</div>
                <div>
                  <p className="font-bold text-white">Storm Assessment</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Identifies severe weather events like hail damage and leakage issues.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">STEP 2</div>
                <div>
                  <p className="font-bold text-white">Homeowner Verification</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ensures the lead actually owns the property before assigning local engineers.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">STEP 3</div>
                <div>
                  <p className="font-bold text-white">Contact Validation</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Acquires Name, active SMS number and Email, synced directly into the CRM Board.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500/10 text-orange-400 p-1 rounded-md font-mono font-bold text-[10px]">STEP 4</div>
                <div>
                  <p className="font-bold text-white">Autonomous Booking</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Schedules calendar inspection slots instantly in our mock scheduling portal.</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Quick status report */}
          {hasQualified && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl flex items-start space-x-3 animate-fadeIn">
              <Calendar className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">Lead Transferred to CRM!</h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Homeowner was successfully qualified. Check the <strong>CRM Leads Board</strong> tab to view the live dashboard profile and chat transcripts.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
