import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Calendar, Check, CloudLightning, CreditCard, LayoutDashboard, Lock, MessageSquare, Send, ShieldCheck, Users } from 'lucide-react';
import './public.css';

/* ---------------------------------------------------------------------------
 * Public landing page. All copy describes things the product really does.
 * The demo chat talks to /api/demo-chat (public, tightly rate-limited, no tools,
 * never collects personal details or saves anything).
 * ------------------------------------------------------------------------- */

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const openingMessage =
  'Hi there! Ask me how RoofFlow AI handles a homeowner asking about a roof issue. This demo is for product questions only, so please do not share personal details.';
const quickQuestions = ['How does lead response work?', 'Can it help request inspections?', 'What happens to my CRM?'];
const fallbackReply =
  'RoofFlow AI helps roofing teams answer homeowner inquiries quickly, capture verified leads, manage them in a CRM, and request inspections. This public demo does not collect contact details or save anything.';

/** Fades sections in as they scroll into view (skipped for reduced motion / old browsers). */
function useReveal() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

const DemoChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: openingMessage }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const sendMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setDemoError(null);

    try {
      const res = await fetch('/api/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (res.status === 429) {
        setMessages((current) => [...current, { role: 'assistant', content: fallbackReply }]);
        setDemoError('You have reached the demo limit for now. Create a free account to keep going.');
        return;
      }
      const data = (await res.json().catch(() => null)) as { reply?: string } | null;
      if (!res.ok || !data?.reply) throw new Error('demo unavailable');
      setMessages((current) => [...current, { role: 'assistant', content: data.reply as string }]);
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: fallbackReply }]);
      setDemoError('The live assistant is unavailable right now. A short product summary was shown instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-demo">
      <div className="lp-demo-top">
        <div className="lp-demo-who">
          <span className="lp-mark"><Bot size={20} aria-hidden /></span>
          <div>
            <div className="lp-demo-name">RoofFlow assistant</div>
            <div className="lp-demo-sub">Public product demo</div>
          </div>
        </div>
        <span className="lp-live"><i /> Interactive demo</span>
      </div>

      <div className="lp-chat" ref={scrollRef} aria-live="polite">
        {messages.map((message, index) => (
          <div className={`lp-msg${message.role === 'user' ? ' user' : ''}`} key={`${index}-${message.role}`}>
            {message.content}
          </div>
        ))}
        {busy && <div className="lp-dots" aria-label="The assistant is typing"><i /><i /><i /></div>}
      </div>

      {demoError && <div className="lp-demo-err" role="status">{demoError}</div>}

      <div className="lp-picks" aria-label="Suggested questions">
        {quickQuestions.map((question) => (
          <button key={question} type="button" disabled={busy} onClick={() => void sendMessage(question)}>
            {question}
          </button>
        ))}
      </div>

      <form className="lp-form" onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }}>
        <input
          aria-label="Ask about RoofFlow AI"
          placeholder="Ask about RoofFlow AI..."
          value={input}
          maxLength={400}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
        />
        <button aria-label="Send message" type="submit" disabled={busy || !input.trim()}>
          <Send size={17} aria-hidden />
        </button>
      </form>
      <div className="lp-note"><Lock size={13} aria-hidden /> Please don&apos;t enter personal details. This demo never saves to a CRM.</div>
    </div>
  );
};

export const LandingPage: React.FC = () => {
  useReveal();

  return (
    <div className="lp">
      <div className="lp-glow lp-glow--a"></div>
      <div className="lp-glow lp-glow--b"></div>
      <div className="lp-glow lp-glow--c"></div>

      <div className="lp-nav-outer">
        <div className="lp-wrap">
          <header className="lp-nav">
            <a className="lp-brand" href="/" aria-label="RoofFlow AI home">
              <span className="lp-mark"><CloudLightning size={19} aria-hidden /></span>
              <span>RoofFlow <b>AI</b></span>
            </a>
            <nav className="lp-links" aria-label="Main navigation">
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#demo">Demo</a>
              <a href="#pricing">Pricing</a>
            </nav>
            <div className="lp-nav-cta">
              <a className="lp-signin" href="/login">Sign in</a>
              <a className="lp-btn lp-btn--primary lp-btn--sm" href="/signup">Start free <ArrowRight size={16} aria-hidden /></a>
            </div>
          </header>
        </div>
      </div>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <span className="lp-badge"><i></i> AI lead capture for roofing contractors</span>
              <h1>A Clearer Way to Manage <span className="lp-grad">Roofing Inquiries</span></h1>
              <p className="lp-lead">RoofFlow AI includes an AI-powered dashboard chatbot and an embeddable website widget. The widget guides visitors through a roof concern, property ZIP, contact details and follow-up consent, then submits the inquiry to the contractor&apos;s CRM. An optional live-AI acknowledgement may be available in the widget.</p>
              <div className="lp-ctas">
                <a className="lp-btn lp-btn--primary" href="/signup">Start Free - No Credit Card <ArrowRight size={18} aria-hidden /></a>
                <a className="lp-btn lp-btn--ghost" href="#how-it-works">See how it works</a>
              </div>
              <div className="lp-fine">
                <span><Check size={15} aria-hidden /> 20 chats a month on the free plan</span>
                <span><Check size={15} aria-hidden /> Set up in minutes</span>
              </div>
            </div>

            <div className="lp-preview" aria-label="Preview of the RoofFlow AI dashboard">
              <div className="lp-dash">
                <aside className="lp-dash-side">
                  <div className="lp-dash-logo"><span className="lp-mark"><CloudLightning size={15} aria-hidden /></span><span>Roof<b>Flow</b> AI</span></div>
                  <div className="lp-dash-nav">
                    <span className="on"><LayoutDashboard size={15} aria-hidden /> Dashboard</span>
                    <span><MessageSquare size={15} aria-hidden /> Chatbot</span>
                    <span><Users size={15} aria-hidden /> CRM Leads</span>
                    <span><Calendar size={15} aria-hidden /> Calendar</span>
                    <span><CreditCard size={15} aria-hidden /> Billing</span>
                  </div>
                </aside>
                <div className="lp-dash-main">
                  <div className="lp-dash-title">Dashboard <small>Preview</small></div>
                  <div className="lp-stats">
                    <div className="lp-stat"><span>Leads</span><b>—</b></div>
                    <div className="lp-stat"><span>Inspections</span><b>—</b></div>
                    <div className="lp-stat"><span>Won</span><b>—</b></div>
                  </div>
                  <div className="lp-bars" aria-label="Chart preview; no sample data shown">No sample data</div>
                  <div className="lp-leads">
                    <div className="lp-lead-row"><div>Leads submitted through your widget appear here.</div></div>
                  </div>
                </div>
              </div>
              <div className="lp-phone" aria-label="Example roofing chat conversation">
                <div className="lp-phone-head"><span>Roofing chat</span><span>Now</span></div>
                <div className="lp-bubble lp-bubble--ai">What&apos;s going on with your roof?</div>
                <div className="lp-bubble lp-bubble--me">There&apos;s a leak in the ceiling.</div>
                <div className="lp-bubble lp-bubble--ai">What&apos;s the property ZIP code?</div>
                <div className="lp-phone-tag">Guided widget chat</div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="features">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <h2>Tools to manage roof inquiries <span className="lp-muted">from first chat through follow-up.</span></h2>
              <p className="lp-sub">Collect inquiries and keep contractor follow-up organized.</p>
            </div>
            <div className="lp-grid3">
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Bot size={22} aria-hidden /></span><span className="lp-card-arrow"><ArrowRight size={18} aria-hidden /></span>
                <h3>Embeddable lead-capture widget</h3>
                <p>Guides visitors through a roof concern, property ZIP, contact details and explicit follow-up consent before submitting the inquiry. An optional live-AI acknowledgement may be available.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><ShieldCheck size={22} aria-hidden /></span><span className="lp-card-arrow"><ArrowRight size={18} aria-hidden /></span>
                <h3>Verified contact details</h3>
                <p>Checks phone and email formats before submission; it does not verify that contact details belong to a real person.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Users size={22} aria-hidden /></span><span className="lp-card-arrow"><ArrowRight size={18} aria-hidden /></span>
                <h3>CRM leads board</h3>
                <p>Move leads from New Lead to Inspection Scheduled to Closed-Won, with the whole chat attached.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Calendar size={22} aria-hidden /></span><span className="lp-card-arrow"><ArrowRight size={18} aria-hidden /></span>
                <h3>Google Calendar booking</h3>
                <p>Connect your calendar and an inspection request becomes an event, with an invite and a 24-hour reminder.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><MessageSquare size={22} aria-hidden /></span><span className="lp-card-arrow"><ArrowRight size={18} aria-hidden /></span>
                <h3>Conversation history</h3>
                <p>Every message stays on the lead, in order, with timestamps, so you know exactly what was said.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Lock size={22} aria-hidden /></span><span className="lp-card-arrow"><ArrowRight size={18} aria-hidden /></span>
                <h3>Private by account</h3>
                <p>Each company&apos;s leads are kept separate. Only you can see your leads and conversations.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section" id="how-it-works">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <h2>From first message to submitted inquiry <span className="lp-muted">in three steps.</span></h2>
              <p className="lp-sub">The embeddable chat guides homeowners through the information and contact permission the contractor needs.</p>
            </div>
            <div className="lp-steps">
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">01</span>
                <h3>A visitor describes the roof concern</h3>
                <p>The widget asks what is happening with the roof and collects the property ZIP code, which the visitor may choose not to provide.</p>
              </article>
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">02</span>
                <h3>The visitor provides contact details and consent</h3>
                <p>The visitor enters a name and phone number, email address, or both, then explicitly agrees to follow-up by phone, text or email.</p>
              </article>
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">03</span>
                <h3>The inquiry is submitted to the CRM</h3>
                <p>After consent, the widget submits the inquiry and conversation to the contractor&apos;s tenant CRM for follow-up.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section" id="demo">
          <div className="lp-wrap lp-demo-wrap">
            <div className="lp-reveal">
              <span className="lp-eyebrow">Live demo</span>
              <h2>Ask it anything <span className="lp-muted">about RoofFlow.</span></h2>
              <ul className="lp-points">
                <li><Check size={18} aria-hidden /> <span>This is a real AI assistant, not a recording.</span></li>
                <li><Check size={18} aria-hidden /> <span>It explains how RoofFlow works. It does not collect personal details.</span></li>
                <li><Check size={18} aria-hidden /> <span>Create a free account to try the full chatbot on your own leads.</span></li>
              </ul>
            </div>
            <div className="lp-reveal">
              <DemoChat />
            </div>
          </div>
        </section>

        <section className="lp-section" id="pricing">
          <div className="lp-wrap lp-center">
            <div className="lp-reveal">
              <span className="lp-eyebrow">Pricing</span>
              <h2>Simple pricing. <span className="lp-muted">Start free.</span></h2>
              <p className="lp-lead">Pick the plan that fits your monthly chat volume. No credit card to start.</p>
            </div>
            <div className="lp-prices">
              <article className="lp-price lp-reveal">
                <h3>Free</h3>
                <div className="lp-amount">$0<small>/month</small></div>
                <div className="lp-chats">20 chats / month</div>
                <ul>
                  <li><Check size={18} aria-hidden /> Embeddable lead-capture widget</li>
                  <li><Check size={18} aria-hidden /> Phone and email validation</li>
                  <li><Check size={18} aria-hidden /> Lead capture</li>
                </ul>
                <a className="lp-btn lp-btn--ghost lp-btn--block" href="/signup">Start Free <ArrowRight size={16} aria-hidden /></a>
              </article>
              <article className="lp-price lp-price--pop lp-reveal">
                <span className="lp-pop">MOST POPULAR</span>
                <h3>Starter</h3>
                <div className="lp-amount">$19<small>/month</small></div>
                <div className="lp-chats">250 chats / month</div>
                <ul>
                  <li><Check size={18} aria-hidden /> Everything in Free</li>
                  <li><Check size={18} aria-hidden /> CRM leads board</li>
                  <li><Check size={18} aria-hidden /> Dashboard and lead reporting</li>
                </ul>
                <a className="lp-btn lp-btn--primary lp-btn--block" href="/signup">Get Started <ArrowRight size={16} aria-hidden /></a>
              </article>
              <article className="lp-price lp-reveal">
                <h3>Pro</h3>
                <div className="lp-amount">$39<small>/month</small></div>
                <div className="lp-chats">1,000 chats / month</div>
                <ul>
                  <li><Check size={18} aria-hidden /> Everything in Starter</li>
                  <li><Check size={18} aria-hidden /> All features unlocked</li>
                  <li><Check size={18} aria-hidden /> Agents 2-4 (simulation preview)</li>
                  <li><Check size={18} aria-hidden /> Highest chat volume</li>
                </ul>
                <a className="lp-btn lp-btn--ghost lp-btn--block" href="/signup">Get Started <ArrowRight size={16} aria-hidden /></a>
              </article>
            </div>
            <p className="lp-price-note lp-reveal">No credit card to start. Upgrade or cancel any time from your account.</p>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-cta lp-reveal">
              <h2>Ready to stop <span className="lp-grad">losing leads?</span></h2>
              <p className="lp-lead">Create your free workspace in a few minutes and let the next storm-season inquiry land in your CRM.</p>
              <div className="lp-ctas">
                <a className="lp-btn lp-btn--primary" href="/signup">Start Free - No Credit Card <ArrowRight size={18} aria-hidden /></a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <a className="lp-brand" href="/"><span className="lp-mark"><CloudLightning size={19} aria-hidden /></span><span>RoofFlow <b>AI</b></span></a>
          <nav aria-label="Footer navigation">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="/login">Sign in</a>
          </nav>
          <span>&copy; 2026 RoofFlow AI</span>
        </div>
      </footer>
    </div>
  );
};
