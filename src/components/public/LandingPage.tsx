import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, Bot, Check, Clock3, LockKeyhole, MessageSquareText, Send, ShieldCheck, Sparkles, Target, Workflow, Zap } from 'lucide-react';
import { callAgentApi } from '../../utils/aiService';
import './public.css';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const openingMessage = 'Hi there. I can show how RoofFlow AI responds to a homeowner asking about a roof issue. This demo is for product questions only; please do not share personal or property details.';
const quickQuestions = ['How does lead response work?', 'Can it help request inspections?', 'What happens to my CRM?'];
const fallbackReply = 'RoofFlow AI helps roofing teams respond to homeowner inquiries quickly, capture qualified leads, manage them in a CRM, and request inspections. This public demo does not collect contact details or save anything to a CRM.';

export const LandingPage: React.FC = () => {
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
      const result = await callAgentApi({
        agentType: 'chatbot',
        messages: [
          {
            role: 'assistant',
            content: 'You are a public RoofFlow AI product demo. Explain only capabilities stated here: answer homeowner inquiries quickly, capture qualified leads, manage a CRM, and request inspections. Do not ask for, solicit, infer, or repeat personal contact details or property identifiers. Do not claim that the public demo creates leads, writes to a CRM, books appointments, or confirms service. Keep replies concise and helpful.',
          },
          ...next,
        ],
        context: {
          experience: 'public product demo',
          privacy: 'Do not collect personal contact details or write CRM data.',
        },
      });
      setMessages((current) => [...current, { role: 'assistant', content: result?.trim() || fallbackReply }]);
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: fallbackReply }]);
      setDemoError('The live assistant is unavailable right now. A safe local product explanation was shown instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="rf-public">
      <header className="rf-container rf-nav">
        <a className="rf-brand" href="/" aria-label="RoofFlow AI home">
          <span className="rf-brand-mark"><Workflow size={19} strokeWidth={2.3} /></span>
          <span className="rf-brand-name">RoofFlow <span>AI</span></span>
        </a>
        <nav className="rf-nav-actions" aria-label="Main navigation">
          <a className="rf-text-link" href="#pricing">Pricing</a>
          <a className="rf-text-link" href="/login">Log in</a>
          <a className="rf-button" href="/signup">Start free <ArrowRight size={15} /></a>
        </nav>
      </header>

      <section className="rf-container rf-hero">
        <div className="rf-hero-grid">
          <div className="rf-hero-copy">
            <span className="rf-kicker">The lead-response workspace for roofers</span>
            <h1>Stop Losing Roofing Leads <em>Forever</em></h1>
            <p>When a homeowner reaches out, the next move matters. RoofFlow AI helps your team respond quickly, qualify the conversation, manage leads, and request inspections—all in one workspace.</p>
            <div className="rf-hero-ctas">
              <a href="/signup" className="rf-button">Start Free - No Credit Card <ArrowRight size={16} /></a>
              <a href="#how-it-works" className="rf-button rf-button-quiet">See how it works <ArrowDownRight size={15} /></a>
            </div>
            <div className="rf-proof-line">
              <span><ShieldCheck size={15} /> Built for contractor teams</span>
              <span><Clock3 size={15} /> Faster first response</span>
            </div>
          </div>

          <section className="rf-demo-card" aria-label="Interactive public chatbot demo">
            <div className="rf-demo-top">
              <div className="rf-demo-heading">
                <span className="rf-bot-mark"><Bot size={19} /></span>
                <div>
                  <div className="rf-demo-title">RoofFlow assistant</div>
                  <div className="rf-demo-subtitle">PUBLIC PRODUCT DEMO</div>
                </div>
              </div>
              <span className="rf-live-badge"><i /> Demo live</span>
            </div>
            <div className="rf-chat-area" ref={scrollRef} aria-live="polite">
              {messages.map((message, index) => (
                <div className={`rf-chat-msg${message.role === 'user' ? ' user' : ''}`} key={`${index}-${message.role}`}>
                  {message.content}
                </div>
              ))}
              {busy && <div className="rf-chat-loading" aria-label="Assistant is responding"><i /><i /><i /></div>}
            </div>
            {demoError && <div className="rf-demo-error" role="status">{demoError} <button className="rf-retry" onClick={() => void sendMessage(messages[messages.length - 1]?.content ?? '')}>Retry</button></div>}
            <div className="rf-quick-picks" aria-label="Suggested questions">
              {quickQuestions.map((question) => (
                <button key={question} type="button" disabled={busy} onClick={() => void sendMessage(question)}>{question}</button>
              ))}
            </div>
            <form className="rf-chat-form" onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }}>
              <input aria-label="Ask about RoofFlow AI" placeholder="Ask about RoofFlow AI..." value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} />
              <button aria-label="Send message" type="submit" disabled={busy || !input.trim()}><Send size={16} /></button>
            </form>
            <div className="rf-demo-footnote"><LockKeyhole size={13} /> Please don't enter personal details. This demo never saves to a CRM.</div>
          </section>
        </div>
      </section>

      <div className="rf-strip">
        <div className="rf-container rf-strip-inner">
          <span className="rf-strip-label">One clear workflow</span>
          <span className="rf-strip-item"><MessageSquareText size={17} /> Answer inquiries</span>
          <span className="rf-strip-item"><Target size={17} /> Qualify leads</span>
          <span className="rf-strip-item"><Workflow size={17} /> Manage your CRM</span>
          <span className="rf-strip-item"><Clock3 size={17} /> Request inspections</span>
        </div>
      </div>

      <section className="rf-container rf-section rf-problem">
        <div className="rf-problem-aside">
          <span className="rf-kicker">The moment that matters</span>
          <h2 className="rf-display" style={{ fontSize: 'clamp(31px,4vw,47px)', lineHeight: 1.08, letterSpacing: '-.06em', margin: '17px 0 0' }}>A missed message can become a missed job.</h2>
          <p style={{ color: '#9ca8b9', fontSize: 14, lineHeight: 1.7, marginTop: 16 }}>Roofing teams are in the field, on calls, and juggling the next job. RoofFlow gives incoming conversations a clear path forward.</p>
          <blockquote className="rf-quote">“Be there when the homeowner is ready to talk.”</blockquote>
        </div>
        <div className="rf-problem-list">
          <article className="rf-problem-row">
            <span className="rf-problem-index">01 / RESPONSE</span>
            <h3>Get back to homeowners sooner</h3>
            <p>Give new inquiries a prompt, helpful first response while your team is working.</p>
          </article>
          <article className="rf-problem-row">
            <span className="rf-problem-index">02 / QUALIFICATION</span>
            <h3>Keep the conversation focused</h3>
            <p>Capture the details your team needs to understand whether a lead is qualified.</p>
          </article>
          <article className="rf-problem-row">
            <span className="rf-problem-index">03 / ORGANIZATION</span>
            <h3>See every lead in one place</h3>
            <p>Manage your incoming opportunities through a dedicated roofing CRM workspace.</p>
          </article>
          <article className="rf-problem-row">
            <span className="rf-problem-index">04 / NEXT STEP</span>
            <h3>Move toward an inspection</h3>
            <p>Make inspection requests a natural next step in the lead conversation.</p>
          </article>
        </div>
      </section>

      <section className="rf-flow-section" id="how-it-works">
        <div className="rf-container rf-section rf-flow-grid">
          <div>
            <div className="rf-section-head">
              <span className="rf-kicker">A calmer way to follow up</span>
              <h2>From first hello to a clear next step.</h2>
              <p>RoofFlow keeps the process straightforward for the homeowner and your crew.</p>
            </div>
            <div className="rf-flow-steps">
              <div className="rf-flow-step"><span className="rf-step-no">01</span><div><h3>A homeowner reaches out</h3><p>Start with the conversation and the roof concern they want to discuss.</p></div></div>
              <div className="rf-flow-step"><span className="rf-step-no">02</span><div><h3>Respond and qualify</h3><p>Help your team answer quickly and collect the context needed to follow up.</p></div></div>
              <div className="rf-flow-step"><span className="rf-step-no">03</span><div><h3>Keep the lead moving</h3><p>Manage the conversation in your CRM and request an inspection when appropriate.</p></div></div>
            </div>
          </div>
          <div className="rf-flow-visual" aria-label="Diagram showing homeowner inquiry routed through RoofFlow to a contractor team">
            <div className="rf-flow-node n1"><MessageSquareText size={15} /> Homeowner inquiry</div>
            <div className="rf-flow-node n2"><Zap size={15} /> Quick response</div>
            <div className="rf-flow-node n3"><Target size={15} /> Qualified lead</div>
            <div className="rf-flow-node n4"><Clock3 size={15} /> Inspection request</div>
            <div className="rf-flow-center"><Workflow size={42} strokeWidth={1.6} /></div>
          </div>
        </div>
      </section>

      <section className="rf-container rf-section rf-pricing" id="pricing">
        <div className="rf-pricing-top">
          <div className="rf-section-head">
            <span className="rf-kicker">Straightforward pricing</span>
            <h2>Choose your starting point.</h2>
            <p>See the available options. Start with Free—no credit card required.</p>
          </div>
          <p className="rf-pricing-note">Pricing is informational only. Paid-plan checkout and billing are not available here.</p>
        </div>
        <div className="rf-price-list">
          <div className="rf-price-row">
            <div className="rf-price-level"><span className="rf-price-index">01</span><span className="rf-price-name">Free</span></div>
            <span className="rf-price-amount">$0</span>
            <div className="rf-price-status"><a href="/signup">Create your account <ArrowRight size={14} /></a></div>
          </div>
          <div className="rf-price-row">
            <div className="rf-price-level"><span className="rf-price-index">02</span><span className="rf-price-name">RoofFlow</span></div>
            <span className="rf-price-amount">$19</span>
            <span className="rf-price-status">Information only · no checkout</span>
          </div>
          <div className="rf-price-row">
            <div className="rf-price-level"><span className="rf-price-index">03</span><span className="rf-price-name">RoofFlow</span></div>
            <span className="rf-price-amount">$39</span>
            <span className="rf-price-status">Information only · no checkout</span>
          </div>
        </div>
        <div className="rf-pricing-disclaimer"><span>Free signup is the only available plan action.</span><span>No paid plan checkout or billing system.</span></div>
      </section>

      <section className="rf-container rf-final-cta">
        <div className="rf-final-card">
          <div>
            <span className="rf-kicker">Your next lead deserves a reply</span>
            <h2>Put a better first response within reach.</h2>
          </div>
          <a className="rf-button" href="/signup">Start Free - No Credit Card <ArrowRight size={16} /></a>
        </div>
      </section>

      <footer className="rf-footer">
        <div className="rf-container rf-footer-inner">
          <a className="rf-brand" href="/" aria-label="RoofFlow AI home">
            <span className="rf-brand-mark"><Workflow size={17} /></span><span className="rf-brand-name">RoofFlow <span>AI</span></span>
          </a>
          <span>Lead response, made practical for roofing teams.</span>
          <div className="rf-footer-links"><a href="/login">Log in</a><a href="/signup">Create account</a></div>
        </div>
      </footer>
    </main>
  );
};

export default LandingPage;
