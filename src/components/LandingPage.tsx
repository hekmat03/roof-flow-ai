import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  Check,
  CloudLightning,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { PLAN_CATALOG } from '../lib/planAccess';
import { navigate } from '../lib/navigate';
import { Agent1Chatbot } from './Agent1Chatbot';

const FEATURES = [
  { icon: MessageSquare, title: '24/7 AI Chatbot captures leads', body: 'Every homeowner who lands on your site is greeted, qualified, and saved — even after hours.' },
  { icon: ShieldCheck, title: 'Auto-qualify homeowners instantly', body: 'Ownership, storm damage, and contact details are checked before a lead ever hits your board.' },
  { icon: Users, title: 'CRM Board tracks every lead', body: 'Statuses, transcripts, and inspection times live in one board your crew can actually use.' },
  { icon: Calendar, title: 'Google Calendar bookings', body: 'When a homeowner books an inspection, a calendar event is created with a 24-hour reminder.' },
  { icon: BarChart3, title: 'Real-time Analytics', body: 'Leads, conversion rate, and pipeline value come from live data — not a demo spreadsheet.' },
];

export const LandingPage: React.FC = () => {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      <header className="sticky top-0 z-40 glass-strong">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-gradient-to-br from-accent-400 to-accent-600 p-2 rounded-xl shrink-0">
              <CloudLightning className="h-5 w-5 text-slate-950" />
            </div>
            <span className="font-black truncate">Roof<span className="text-accent-400">Flow</span> AI</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="btn-ghost px-3 py-2 text-xs hidden sm:inline-flex" onClick={() => navigate('/login')}>
              Sign in
            </button>
            <button type="button" className="btn-accent px-3 py-2 text-xs" onClick={() => navigate('/signup')}>
              Start For Free
            </button>
          </div>
        </div>
      </header>

      <section className="relative px-4 pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="absolute inset-0 opacity-40 pointer-events-none hero-glow" />
        <div className="max-w-4xl mx-auto text-center relative">
          <span className="inline-flex items-center gap-2 bg-accent-500/10 text-accent-300 text-[11px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider border border-accent-500/25">
            <Zap className="h-3 w-3" /> For roofing contractors
          </span>
          <h1 className="text-fluid-hero font-black mt-5 tracking-tight">
            Stop Losing Roofing Leads Forever.
          </h1>
          <p className="text-slate-300 mt-4 text-fluid-body max-w-2xl mx-auto leading-relaxed">
            RoofFlow AI captures, qualifies and follows up with every homeowner 24/7 — while you focus on the job.
          </p>
          <p className="mt-5 text-sm md:text-base font-semibold text-accent-300">
            Try it free. No credit card required. No risk. Cancel anytime.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" className="btn-accent px-6 py-3 text-sm" onClick={() => navigate('/signup')}>
              Start For Free
            </button>
            <button
              type="button"
              className="btn-ghost px-6 py-3 text-sm"
              onClick={() => {
                setDemoOpen(true);
                document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              See Live Demo
            </button>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:py-16 border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-fluid-title font-bold text-center">Everything you need to keep the book full</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass card-hover rounded-2xl p-5">
                <div className="p-2.5 rounded-xl bg-accent-500/10 border border-accent-500/20 w-fit">
                  <f.icon className="h-5 w-5 text-accent-400" />
                </div>
                <h3 className="font-bold text-white mt-4">{f.title}</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="max-w-3xl mx-auto glass rounded-2xl p-6 md:p-8 text-center">
          <Sparkles className="h-6 w-6 text-accent-400 mx-auto" />
          <p className="mt-3 text-lg font-bold text-white">
            Join roofing contractors already using RoofFlow AI to close more deals
          </p>
          <p className="text-sm text-slate-400 mt-2">Storm season does not wait. Neither should your follow-up.</p>
        </div>
      </section>

      <section id="pricing" className="px-4 py-12 md:py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-fluid-title font-bold text-center">Simple pricing. Cancel anytime.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {PLAN_CATALOG.map((plan) => (
              <div key={plan.id} className={`glass rounded-2xl p-6 flex flex-col ${plan.id === 'starter' ? 'ring-2 ring-accent-500/60' : ''}`}>
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-3xl font-black mt-3">
                  ${plan.priceMonthlyUsd}
                  <span className="text-sm font-semibold text-slate-400">/month</span>
                </p>
                <p className="text-sm text-slate-400 mt-2">{plan.tagline}</p>
                <ul className="mt-5 space-y-2 flex-1">
                  {plan.includes.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-slate-200">
                      <Check className="h-4 w-4 text-accent-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn-accent w-full mt-6 px-4 py-3 text-sm"
                  onClick={() => navigate('/signup')}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="live-demo" className="px-4 py-12 border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-fluid-title font-bold">See the chatbot live</h2>
          <p className="text-sm text-slate-400 mt-1">Talk to Agent 1 the way a homeowner would. No login required for this demo.</p>
          <div className="mt-6">
            {demoOpen ? (
              <Agent1Chatbot />
            ) : (
              <div className="glass rounded-2xl p-8 text-center">
                <MessageSquare className="h-8 w-8 text-accent-400 mx-auto" />
                <p className="mt-3 text-slate-300">Load the live chatbot demo when you are ready.</p>
                <button type="button" className="btn-accent mt-4 px-5 py-3 text-sm" onClick={() => setDemoOpen(true)}>
                  See Live Demo
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="max-w-3xl mx-auto glass rounded-3xl p-8 md:p-12 text-center">
          <h2 className="text-fluid-title font-black">Ready to capture more leads?</h2>
          <p className="text-slate-300 mt-3">Start your free account today. No credit card. No risk. Cancel anytime.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" className="btn-accent px-6 py-3 text-sm" onClick={() => navigate('/signup')}>
              Start For Free
            </button>
            <button type="button" className="btn-ghost px-6 py-3 text-sm" onClick={() => setDemoOpen(true)}>
              See Live Demo
            </button>
          </div>
        </div>
      </section>

      <footer className="px-4 py-8 border-t border-slate-800/80 text-center text-xs text-slate-500">
        RoofFlow AI · Built for roofing contractors
      </footer>
    </div>
  );
};
