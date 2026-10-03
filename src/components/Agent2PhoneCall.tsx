import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Phone, PhoneOff, Mic, Play, Volume2, Calendar, Sparkles, User, ShieldAlert, Send } from 'lucide-react';
import { getAgentResponse, type AgentContext } from '../lib/agentService';

interface ScriptOption {
  text: string;
  next: number;
  name?: string;
  phone?: string;
  owner?: 'Owner' | 'Renter';
}

interface ScriptStep {
  step: number;
  /** Intent the AI generator should use for the response spoken after this option is chosen. */
  intent: 'greeting' | 'hail' | 'insurance' | 'owner' | 'renter' | 'scheduleask' | 'schedule' | 'thanks';
  options: ScriptOption[];
}

export const Agent2PhoneCall: React.FC = () => {
  const { companySettings, addLead } = useApp();

  const agentContext: AgentContext = {
    companyName: companySettings.companyName,
    city: companySettings.city,
    stormEvent: companySettings.stormName,
    stormDate: companySettings.stormDate,
    financingOptions: companySettings.financingOptions,
    agentTone: companySettings.agentTone,
  };

  // Call state
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'completed'>('idle');
  const [dialogue, setDialogue] = useState<Array<{ speaker: 'AI' | 'Homeowner'; text: string }>>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customReply, setCustomReply] = useState('');

  // Lead info captured via phone call
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyStatus, setPropertyStatus] = useState<'Owner' | 'Renter'>('Owner');

  // Phone quick dialogue flow — each step declares which AI intent voices the next response,
  // so every line is generated (settings-aware, varied) instead of hardcoded.
  const scriptSteps: ScriptStep[] = [
    {
      step: 0,
      intent: 'greeting',
      options: [
        { text: "Yes, I need an inspection. Our roof has major storm damage.", next: 1 },
        { text: "No, I just want a general estimate.", next: 2 }
      ]
    },
    {
      step: 1,
      intent: 'hail',
      options: [
        { text: "Yes, I am the homeowner.", next: 3, owner: 'Owner' as const },
        { text: "No, I rent the property.", next: 4, owner: 'Renter' as const }
      ]
    },
    {
      step: 2,
      intent: 'insurance',
      options: [
        { text: "Yes, I own the home.", next: 3, owner: 'Owner' as const },
        { text: "No, I rent.", next: 4, owner: 'Renter' as const }
      ]
    },
    {
      step: 3,
      intent: 'scheduleask',
      options: [
        { text: "My name is Arthur Dent, call me at (817) 555-0411", next: 5, name: "Arthur Dent", phone: "(817) 555-0411" },
        { text: "I'm Ford Prefect, phone is (214) 555-1215", next: 5, name: "Ford Prefect", phone: "(214) 555-1215" }
      ]
    },
    {
      step: 4,
      intent: 'renter',
      options: [
        { text: "I will have my landlord call you back directly.", next: 6 },
        { text: "My landlord's name is Mr. Prosser, (214) 555-0012", next: 5, name: "Mr. Prosser (Landlord)", phone: "(214) 555-0012" }
      ]
    },
    {
      step: 5,
      intent: 'scheduleask',
      options: [
        { text: "Morning slots are best.", next: 7 },
        { text: "Afternoon slots work better.", next: 7 }
      ]
    },
    {
      step: 7,
      intent: 'schedule',
      options: [
        { text: "No, that's perfect. Thank you!", next: 8 }
      ]
    }
  ];

  const speak = async (intent: ScriptStep['intent'], userText: string) => {
    setIsGenerating(true);
    try {
      const reply = await getAgentResponse(
        'phone',
        [{ role: 'user', content: userText }],
        { ...agentContext, replyIntent: intent }
      );
      setDialogue(prev => [...prev, { speaker: 'AI', text: reply }]);
      return reply;
    } finally {
      setIsGenerating(false);
    }
  };

  /** Free-form reply: NO forced intent — the generator detects the intent live. */
  const speakFreeForm = async (userText: string) => {
    setIsGenerating(true);
    try {
      const reply = await getAgentResponse(
        'phone',
        [{ role: 'user', content: userText }],
        agentContext
      );
      setDialogue(prev => [...prev, { speaker: 'AI', text: reply }]);
      return reply;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartCall = async () => {
    setCallStatus('calling');
    setDialogue([]);
    setCurrentStep(0);
    setName('');
    setPhone('');
    setPropertyStatus('Owner');

    setTimeout(async () => {
      setCallStatus('connected');
      await speak('greeting', 'incoming call');
    }, 1200);
  };

  const handleSelectOption = async (option: ScriptOption) => {
    if (isGenerating) return;

    // Homeowner speech
    setDialogue(prev => [...prev, { speaker: 'Homeowner', text: option.text }]);

    // Capture lead fields offered by the option
    if (option.name) setName(option.name);
    if (option.phone) setPhone(option.phone);
    if (option.owner) setPropertyStatus(option.owner);

    const nextStepIndex = option.next;
    const step = scriptSteps.find(s => s.step === currentStep);

    if (nextStepIndex === 8) {
      // Completed call — book inspection and push lead to CRM with the FULL transcript
      const confirmLine = await speak(step?.intent ?? 'schedule', option.text);
      const goodbyeMsg = 'Thank you for calling! Goodbye!';
      const fullTranscript: Array<{ speaker: 'AI' | 'Homeowner'; text: string }> = [
        ...dialogue,
        { speaker: 'Homeowner', text: option.text },
        { speaker: 'AI', text: confirmLine },
        { speaker: 'AI', text: goodbyeMsg },
      ];
      setDialogue(fullTranscript);
      setCallStatus('completed');
      addLead({
        name: name || 'Arthur Dent',
        phone: phone || '(817) 555-0411',
        email: `${(name || 'arthur').toLowerCase().replace(/\s/g, '')}@gmail.com`,
        propertyOwnership: propertyStatus,
        status: 'Inspection Scheduled',
        agentType: 'Phone Call',
        scheduledDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + ' 10:00 AM',
        chatLog: fullTranscript.map(d => ({
          sender: d.speaker === 'AI' ? 'AI' : 'User',
          text: d.text,
          timestamp: new Date().toLocaleTimeString()
        }))
      });
      return;
    }

    if (nextStepIndex === 6) {
      // Landlord will call back — cordial close, no booking
      await speak('thanks', option.text);
      setCallStatus('completed');
      return;
    }

    // Move to next step and voice it with that step's intent
    const nextStep = scriptSteps.find(s => s.step === nextStepIndex);
    if (nextStep) {
      setCurrentStep(nextStepIndex);
      await speak(nextStep.intent, option.text);
    }
  };

  const handleCustomReply = async () => {
    if (!customReply.trim() || isGenerating || callStatus !== 'connected') return;
    const text = customReply.trim();
    setCustomReply('');
    setDialogue(prev => [...prev, { speaker: 'Homeowner', text }]);
    await speakFreeForm(text);
  };

  const handleEndCall = () => {
    setCallStatus('idle');
    setDialogue([]);
  };

  const currentScriptStep = scriptSteps.find(s => s.step === currentStep);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Agent 2: Inbound Call Voice Handler</h2>
        <p className="text-xs text-slate-400 mt-1">
          Interactive voice call simulation. Every AI line is generated live from your company settings — experience how the AI Voice Handler answers incoming homeowner calls, overcomes insurance pushbacks, and books inspections.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Telephone UI (5 cols) */}
        <div className="lg:col-span-5 glass rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-full font-bold font-mono uppercase tracking-wider">
              Inbound Line Simulator
            </span>
            <h3 className="text-white font-extrabold text-base mt-3">Interactive Voice Console</h3>
            <p className="text-slate-400 text-xs mt-1">Simulate incoming customer storm inquiries</p>
          </div>

          {/* Smartphone Render Frame */}
          <div className="w-full max-w-[280px] call-glass border-4 border-slate-700/50 rounded-[36px] p-6 shadow-2xl relative flex flex-col justify-between h-[440px] overflow-hidden call-screen-blur">
            {/* Phone notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-800 rounded-full"></div>

            {/* Calling states */}
            {callStatus === 'idle' && (
              <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center animate-pulse">
                  <Phone className="h-8 w-8 text-orange-500" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Line Status: Available</h4>
                  <p className="text-[10px] text-slate-500 mt-1">Ready to receive/place storm leads calls</p>
                </div>
                <button
                  onClick={handleStartCall}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black px-6 py-2.5 rounded-full text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
                >
                  <Play className="h-3.5 w-3.5 fill-slate-950" /> Place Demo Call
                </button>
              </div>
            )}

            {callStatus === 'calling' && (
              <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center animate-bounce">
                  <Volume2 className="h-8 w-8 text-orange-500" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Connecting Call...</h4>
                  <p className="text-[10px] text-slate-500 mt-1">Connecting callback router to AI agent</p>
                </div>
                <button
                  onClick={handleEndCall}
                  className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg shadow-red-500/10 transition"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
              </div>
            )}

            {(callStatus === 'connected' || callStatus === 'completed') && (
              <div className="flex-1 flex flex-col justify-between items-center text-center py-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Voice Active</h4>
                  <p className="text-sm font-black text-white">{name || 'Arthur Dent'}</p>
                  <p className="text-[9px] text-emerald-400 font-mono font-bold">00:42 • Connected</p>
                </div>

                <div className="grid grid-cols-3 gap-4 my-6">
                  <div className="flex flex-col items-center">
                    <button className="min-h-0 h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition">
                      <Mic className="h-4 w-4" />
                    </button>
                    <span className="text-[9px] text-slate-500 mt-1.5">Mute</span>
                  </div>
                  <div className="flex flex-col items-center col-span-1">
                    <button className="min-h-0 h-10 w-10 rounded-full bg-accent-500/10 border border-accent-500/20 flex items-center justify-center text-accent-400 transition animate-pulse">
                      <Volume2 className="h-4 w-4" />
                    </button>
                    <span className="text-[9px] text-orange-400 mt-1.5 font-bold">Speaker</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <button className="min-h-0 h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition">
                      <User className="h-4 w-4" />
                    </button>
                    <span className="text-[9px] text-slate-500 mt-1.5">Keypad</span>
                  </div>
                </div>

                <button
                  onClick={handleEndCall}
                  className="bg-red-500 hover:bg-red-600 text-white p-3.5 rounded-full shadow-lg shadow-red-500/20 transition shrink-0"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Call Transcript Scroll View (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass rounded-2xl p-6 h-[500px] flex flex-col justify-between">
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800 shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-orange-500" /> Call Transcript & Dialogue Log
              </h3>

              {/* Log view */}
              <div className="flex-1 overflow-y-auto space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 premium-scroll">
                {dialogue.length > 0 ? (
                  dialogue.map((item, index) => {
                    const isAI = item.speaker === 'AI';
                    return (
                      <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                        <div className={`max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                          isAI 
                            ? 'chat-bubble-ai rounded-tl-none' 
                            : 'chat-bubble-user rounded-tr-none'
                        }`}>
                          <span className="text-[9px] opacity-40 font-black uppercase tracking-wider block mb-1">
                            {isAI ? 'AI Agent Voice' : 'Homeowner Speech'}
                          </span>
                          <p>{item.text}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 italic space-y-2">
                    <Phone className="h-8 w-8 opacity-40" />
                    <p className="text-xs">Dialogue log is empty. Place a callback line simulation to connect.</p>
                  </div>
                )}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2"><div className="typing-indicator"><span></span><span></span><span></span></div><span className="text-[10px] text-slate-500 italic">AI is speaking…</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* Telephone options select */}
            {callStatus === 'connected' && currentScriptStep && (
              <div className="mt-6 border-t border-slate-800 pt-4 shrink-0 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-orange-500" /> Select dialogue reply option:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {currentScriptStep.options.map((option, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectOption(option)}
                      disabled={isGenerating}
                      className="btn-ghost text-xs text-left px-4 py-2.5 justify-start disabled:opacity-50"
                    >
                      {option.text}
                    </button>
                  ))}
                </div>

                {/* Free-form reply → live intent detection */}
                <div className="flex space-x-2 pt-1">
                  <input
                    type="text"
                    placeholder="Type your own reply (AI answers live)..."
                    value={customReply}
                    onChange={e => setCustomReply(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCustomReply()}
                    disabled={isGenerating}
                    className="flex-1 input-premium px-3 py-2 text-xs disabled:opacity-50"
                  />
                  <button
                    onClick={handleCustomReply}
                    disabled={isGenerating}
                    className="btn-accent px-3.5 rounded-xl text-xs font-bold min-h-0 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </div>
                <p className="text-[9px] text-slate-500">Free-form replies stay in the transcript — the script only advances via the options above.</p>
              </div>
            )}
            
            {callStatus === 'completed' && (
              <div className="mt-6 border-t border-slate-800 pt-4 shrink-0 bg-emerald-500/10 border border-emerald-500/15 p-4 rounded-xl flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-white">Call Completed! Lead Saved.</h4>
                  <p className="text-[10px] text-slate-400">The inspection callback was scheduled. Lead profile has been added to the CRM Board.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};