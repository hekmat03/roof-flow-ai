import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Phone, PhoneOff, Mic, Play, Volume2, Calendar, Sparkles, User, ShieldAlert } from 'lucide-react';

export const Agent2PhoneCall: React.FC = () => {
  const { companySettings, addLead } = useApp();
  
  // Call state
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'completed'>('idle');
  const [dialogue, setDialogue] = useState<Array<{ speaker: 'AI' | 'Homeowner'; text: string }>>([]);
  const [currentStep, setCurrentStep] = useState(0);
  
  // Lead info captured via phone call
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyStatus, setPropertyStatus] = useState<'Owner' | 'Renter'>('Owner');

  // Phone quick dialogue selections
  const scriptSteps = [
    {
      step: 0,
      ai: `Thank you for calling ${companySettings.companyName} Claim Support! This is our AI Voice Assistant. Are you calling about a roof inspection after the recent ${companySettings.stormName}?`,
      options: [
        { text: "Yes, I need an inspection. Our roof has major storm damage.", next: 1 },
        { text: "No, I just want a general estimate.", next: 2 }
      ]
    },
    {
      step: 1,
      ai: `I am so sorry to hear that. Severe hail can cause micro-cracks that lead to major water leaks down the road. To get a certified specialist out to inspect your roof for FREE, can you confirm if you are the owner of the property?`,
      options: [
        { text: "Yes, I am the homeowner.", next: 3, owner: 'Owner' as const },
        { text: "No, I rent the property.", next: 4, owner: 'Renter' as const }
      ]
    },
    {
      step: 2,
      ai: `We can certainly help with a general estimate! However, if your area was impacted by the recent ${companySettings.stormName}, your insurance might pay for a full replacement. Are you the property owner?`,
      options: [
        { text: "Yes, I own the home.", next: 3, owner: 'Owner' as const },
        { text: "No, I rent.", next: 4, owner: 'Renter' as const }
      ]
    },
    {
      step: 3,
      ai: `Perfect. Because safety regulations require a homeowner to authorize inspection climbing, we can set this up instantly. Can I get your full name and best callback number?`,
      options: [
        { text: "My name is Arthur Dent, call me at (817) 555-0411", next: 5, name: "Arthur Dent", phone: "(817) 555-0411" },
        { text: "I'm Ford Prefect, phone is (214) 555-1215", next: 5, name: "Ford Prefect", phone: "(214) 555-1215" }
      ]
    },
    {
      step: 4,
      ai: `Ah, I see. Since safety regulations require the property owner to authorize physical roof climbing, we would need to coordinate with your landlord. Could you provide their name or have them call us directly?`,
      options: [
        { text: "I will have my landlord call you back directly.", next: 6 },
        { text: "My landlord's name is Mr. Prosser, (214) 555-0012", next: 5, name: "Mr. Prosser (Landlord)", phone: "(214) 555-0012" }
      ]
    },
    {
      step: 5,
      ai: `Excellent, I've got that down. Now, let's look at scheduling. We have emergency roof inspectors available in ${companySettings.city} this week. Would a morning or afternoon slot work better for you?`,
      options: [
        { text: "Morning slots are best.", next: 7 },
        { text: "Afternoon slots work better.", next: 7 }
      ]
    },
    {
      step: 7,
      ai: `Perfect! I've booked your Free Roof Inspection for tomorrow at 10:00 AM. A digital report with drone photography will be provided. I have also logged this under ${companySettings.companyName} profile. Is there anything else?`,
      options: [
        { text: "No, that's perfect. Thank you!", next: 8 }
      ]
    }
  ];

  const handleStartCall = () => {
    setCallStatus('calling');
    setDialogue([]);
    setCurrentStep(0);
    
    setTimeout(() => {
      setCallStatus('connected');
      setDialogue([
        { speaker: 'AI', text: scriptSteps[0].ai }
      ]);
    }, 1500);
  };

  const handleSelectOption = (option: any) => {
    // Add homeowner speech to log
    setDialogue(prev => [...prev, { speaker: 'Homeowner', text: option.text }]);
    
    // Process intermediate state
    if (option.name) setName(option.name);
    if (option.phone) setPhone(option.phone);
    if (option.owner) setPropertyStatus(option.owner);

    const nextStepIndex = option.next;

    if (nextStepIndex === 8) {
      // Completed call!
      setTimeout(() => {
        setDialogue(prev => [...prev, { speaker: 'AI', text: "Thank you for calling! Goodbye!" }]);
        setCallStatus('completed');
        
        // Push lead to CRM Board
        addLead({
          name: name || 'Arthur Dent',
          phone: phone || '(817) 555-0411',
          email: `${(name || 'arthur').toLowerCase().replace(/\s/g, '')}@gmail.com`,
          propertyOwnership: propertyStatus,
          status: 'Inspection Scheduled',
          agentType: 'Phone Call',
          scheduledDate: new Date(Date.now() + 1*24*60*60*1000).toISOString().split('T')[0] + ' 10:00 AM',
          chatLog: dialogue.map(d => ({
            sender: d.speaker === 'AI' ? 'AI' : 'User',
            text: d.text,
            timestamp: new Date().toLocaleTimeString()
          }))
        });
      }, 1000);
      return;
    }

    if (nextStepIndex === 6) {
      setTimeout(() => {
        setDialogue(prev => [...prev, { speaker: 'AI', text: "No problem at all! We'll wait for their call. Have a wonderful day!" }]);
        setCallStatus('completed');
      }, 1000);
      return;
    }

    // Move to next step
    const nextStep = scriptSteps.find(s => s.step === nextStepIndex);
    if (nextStep) {
      setCurrentStep(nextStepIndex);
      setTimeout(() => {
        setDialogue(prev => [...prev, { speaker: 'AI', text: nextStep.ai }]);
      }, 1000);
    }
  };

  const handleEndCall = () => {
    setCallStatus('idle');
    setDialogue([]);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Agent 2: Inbound Call Voice Handler</h2>
        <p className="text-xs text-slate-400 mt-1">
          Interactive voice call simulation. Experience how the AI Voice Handler answers incoming homeowner calls, overcomes insurance pushbacks, and books inspections.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Telephone UI (5 cols) */}
        <div className="lg:col-span-5 bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-full font-bold font-mono uppercase tracking-wider">
              Inbound Line Simulator
            </span>
            <h3 className="text-white font-extrabold text-base mt-3">Interactive Voice Console</h3>
            <p className="text-slate-400 text-xs mt-1">Simulate incoming customer storm inquiries</p>
          </div>

          {/* Smartphone Render Frame */}
          <div className="w-full max-w-[280px] bg-slate-900 border-4 border-slate-800 rounded-[36px] p-6 shadow-2xl relative flex flex-col justify-between h-[420px] overflow-hidden">
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
                    <button className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition">
                      <Mic className="h-4 w-4" />
                    </button>
                    <span className="text-[9px] text-slate-500 mt-1.5">Mute</span>
                  </div>
                  <div className="flex flex-col items-center col-span-1">
                    <button className="h-10 w-10 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 transition animate-pulse">
                      <Volume2 className="h-4 w-4" />
                    </button>
                    <span className="text-[9px] text-orange-400 mt-1.5 font-bold">Speaker</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <button className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition">
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
          <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md h-[500px] flex flex-col justify-between">
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800 shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-orange-500" /> Call Transcript & Dialogue Log
              </h3>

              {/* Log view */}
              <div className="flex-1 overflow-y-auto space-y-4 bg-slate-900/40 p-4 rounded-xl border border-slate-850/80">
                {dialogue.length > 0 ? (
                  dialogue.map((item, index) => {
                    const isAI = item.speaker === 'AI';
                    return (
                      <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'} animate-slideUp`}>
                        <div className={`max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                          isAI 
                            ? 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none' 
                            : 'bg-orange-500 text-slate-950 font-bold rounded-tr-none'
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
              </div>
            </div>

            {/* Telephone options select */}
            {callStatus === 'connected' && scriptSteps.find(s => s.step === currentStep) && (
              <div className="mt-6 border-t border-slate-800 pt-4 shrink-0 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-orange-500" /> Select dialogue reply option:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {scriptSteps.find(s => s.step === currentStep)?.options.map((option, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectOption(option)}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-xs text-left px-4 py-2.5 rounded-xl text-slate-300 transition duration-150 hover:text-white"
                    >
                      {option.text}
                    </button>
                  ))}
                </div>
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
