import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Calendar, Check, Code, CloudLightning, LayoutDashboard, Lock, Mail, Send, ShieldCheck, Users, X } from 'lucide-react';
import { demoFallbackReply } from '../../lib/demoFallback';
import './public.css';

/* ---------------------------------------------------------------------------
 * Public marketing page. Rule for every line below: it must describe something
 * the product really does today. No testimonials, customer logos, ratings,
 * "trusted by" counts or sample statistics. Prices and limits mirror
 * api/_lib/plans.ts, so change both together.
 * The demo chat talks to /api/demo-chat (public, tightly rate-limited, no tools,
 * never collects personal details or saves anything).
 * ------------------------------------------------------------------------- */

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const openingMessage =
  'Hi there! Ask me how RoofFlow AI handles a homeowner asking about a roof issue. This demo is for product questions only, so please do not share personal details.';
const quickQuestions = ['How does lead response work?', 'Can it help request inspections?', 'What happens to my CRM?'];
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
        setMessages((current) => [...current, { role: 'assistant', content: demoFallbackReply(text) }]);
        setDemoError('You have reached the demo limit for now. Create a free account to keep going.');
        return;
      }
      const data = (await res.json().catch(() => null)) as { reply?: string } | null;
      if (!res.ok || !data?.reply) throw new Error('demo unavailable');
      setMessages((current) => [...current, { role: 'assistant', content: data.reply as string }]);
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: demoFallbackReply(text) }]);
      setDemoError('The live AI is unavailable right now, so this answer comes from a short built-in FAQ. Try again in a minute for a live reply.');
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
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-site.com';
  const snippet = `<script src="${origin}/widget.js" data-key="YOUR_WIDGET_KEY" async></script>`;

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
              <a href="#faq">FAQ</a>
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
              <span className="lp-badge"><i></i> AI chat and CRM for roofing contractors</span>
              <h1>Answer roofing inquiries <span className="lp-grad">while you&apos;re on the roof</span></h1>
              <p className="lp-lead">RoofFlow AI puts a chat on your website that talks with homeowners about their roof problem, collects their contact details with their consent, and files the whole conversation in your CRM, ready for you to follow up.</p>
              <div className="lp-ctas">
                <a className="lp-btn lp-btn--primary" href="/signup">Start free, no credit card <ArrowRight size={18} aria-hidden /></a>
                <a className="lp-btn lp-btn--ghost" href="#how-it-works">See how it works</a>
              </div>
              <div className="lp-fine">
                <span><Check size={15} aria-hidden /> Free plan: 20 chats a month</span>
                <span><Check size={15} aria-hidden /> Added to your site with one script tag</span>
              </div>
            </div>

            <div className="lp-preview" aria-label="Illustration of the RoofFlow AI lead pipeline">
              <div className="lp-board">
                <div className="lp-board-top">
                  <span><LayoutDashboard size={15} aria-hidden /> Lead pipeline</span>
                  <small>Illustration</small>
                </div>
                <div className="lp-cols">
                  {[
                    { stage: 'New Lead', note: 'Roof leak after a storm' },
                    { stage: 'Inspection Scheduled', note: 'Hail damage, north slope' },
                    { stage: 'Estimate Sent', note: 'Missing shingles' },
                    { stage: 'Closed-Won', note: 'Full replacement' },
                  ].map((col) => (
                    <div className="lp-col" key={col.stage}>
                      <div className="lp-col-h">{col.stage}</div>
                      <div className="lp-col-card"><span>{col.note}</span><i /><i /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lp-phone" aria-label="Example roofing chat conversation">
                <div className="lp-phone-head"><span>Website chat</span><span>Example</span></div>
                <div className="lp-bubble lp-bubble--ai">What&apos;s going on with your roof?</div>
                <div className="lp-bubble lp-bubble--me">There&apos;s a leak in the ceiling.</div>
                <div className="lp-bubble lp-bubble--ai">What&apos;s the property ZIP code?</div>
                <div className="lp-phone-tag">Guided widget chat</div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="why">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <h2>A homeowner with a leak <span className="lp-muted">wants an answer now.</span></h2>
              <p className="lp-sub">You&apos;re usually up a ladder, in a truck or on a quote. RoofFlow covers the website side.</p>
            </div>
            <div className="lp-grid3">
              <article className="lp-benefit lp-reveal">
                <h3>Inquiries get a reply</h3>
                <p>The chat starts the conversation the moment a visitor has a question, instead of leaving a form to wait for your next free hour.</p>
              </article>
              <article className="lp-benefit lp-reveal">
                <h3>You know the story before you call</h3>
                <p>Each lead arrives with the roof concern, the property ZIP, their contact details and the full chat attached.</p>
              </article>
              <article className="lp-benefit lp-reveal">
                <h3>Follow-up stays organized</h3>
                <p>Move leads across the board, book inspections on your calendar, and schedule email follow-ups instead of keeping it all in your head.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section" id="features">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <h2>Everything for roof inquiries <span className="lp-muted">in one place.</span></h2>
              <p className="lp-sub">What you get today, nothing more promised.</p>
            </div>
            <div className="lp-grid3">
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Bot size={22} aria-hidden /></span>
                <h3>Website chat widget</h3>
                <p>A floating chat bubble for your site. It asks about the roof concern and the property ZIP, and keeps the visitor moving toward a submitted inquiry.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><ShieldCheck size={22} aria-hidden /></span>
                <h3>Consent-first lead capture</h3>
                <p>Visitors enter contact details and explicitly agree to follow-up before anything is submitted. Phone and email formats are checked; we don&apos;t claim they belong to a real person.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><LayoutDashboard size={22} aria-hidden /></span>
                <h3>CRM leads board</h3>
                <p>Move leads from New Lead through Inspection Scheduled and Estimate Sent to Closed-Won, with the whole conversation on each lead. Starter and Pro.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Calendar size={22} aria-hidden /></span>
                <h3>Google Calendar booking</h3>
                <p>Connect your calendar and an inspection request becomes an event with an invite and a 24-hour email reminder.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Mail size={22} aria-hidden /></span>
                <h3>Email follow-up sequences</h3>
                <p>Schedule a follow-up series for leads who agreed to be contacted. Every email has an unsubscribe link and your business mailing address. Starter and Pro.</p>
              </article>
              <article className="lp-card lp-reveal">
                <span className="lp-card-ico"><Users size={22} aria-hidden /></span>
                <h3>Team workspace</h3>
                <p>Invite up to 10 people as admins or members. Everyone shares your leads; only the owner changes the plan and billing. Each company&apos;s data stays separate from other companies.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section" id="how-it-works">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <h2>From first message to follow-up <span className="lp-muted">in four steps.</span></h2>
              <p className="lp-sub">The chat gathers what you need, with the visitor&apos;s permission.</p>
            </div>
            <div className="lp-steps lp-steps--4">
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">01</span>
                <h3>Add the widget</h3>
                <p>Create a free account and paste one script tag into your website.</p>
              </article>
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">02</span>
                <h3>A visitor describes the roof</h3>
                <p>The chat asks what is happening and for the property ZIP, which the visitor may choose not to give.</p>
              </article>
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">03</span>
                <h3>They share details and consent</h3>
                <p>They enter a name plus a phone number, an email, or both, and agree to be contacted.</p>
              </article>
              <article className="lp-step lp-reveal">
                <span className="lp-step-n">04</span>
                <h3>The lead lands in your CRM</h3>
                <p>You get the inquiry and the conversation. Call, book an inspection, or schedule email follow-ups.</p>
              </article>
            </div>

            <div className="lp-embed lp-reveal">
              <div className="lp-embed-copy">
                <span className="lp-eyebrow"><Code size={14} aria-hidden /> One line to install</span>
                <h3>Paste it before the closing body tag.</h3>
                <p>The widget key is public and identifies your company. It can only add leads to your account and can never read anything. Your key is shown in the CRM once you sign up.</p>
              </div>
              <pre className="lp-code" aria-label="Widget install snippet"><code>{snippet}</code></pre>
            </div>
          </div>
        </section>

        <section className="lp-section" id="demo">
          <div className="lp-wrap lp-demo-wrap">
            <div className="lp-reveal">
              <span className="lp-eyebrow">Live demo</span>
              <h2>Ask it anything <span className="lp-muted">about RoofFlow.</span></h2>
              <ul className="lp-points">
                <li><Check size={18} aria-hidden /> <span>This is a live AI assistant, not a recording.</span></li>
                <li><Check size={18} aria-hidden /> <span>It answers product questions. It does not collect personal details or save anything.</span></li>
                <li><Check size={18} aria-hidden /> <span>Create a free account to try the full chatbot on your own leads.</span></li>
              </ul>
            </div>
            <div className="lp-reveal">
              <DemoChat />
            </div>
          </div>
        </section>

        <section className="lp-section" id="honest">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <h2>Straight about <span className="lp-muted">what it does.</span></h2>
              <p className="lp-sub">So you can decide with the facts.</p>
            </div>
            <div className="lp-honest">
              <article className="lp-honest-col lp-reveal">
                <h3><span className="lp-tag lp-tag--ok">Live today</span></h3>
                <ul>
                  <li><Check size={17} aria-hidden /> Website chat widget and lead capture</li>
                  <li><Check size={17} aria-hidden /> CRM leads board with full conversations</li>
                  <li><Check size={17} aria-hidden /> Google Calendar inspection booking</li>
                  <li><Check size={17} aria-hidden /> Scheduled email follow-ups</li>
                  <li><Check size={17} aria-hidden /> Team access with roles</li>
                </ul>
              </article>
              <article className="lp-honest-col lp-reveal">
                <h3><span className="lp-tag">Preview only</span></h3>
                <ul>
                  <li><Lock size={17} aria-hidden /> Voice agent: a practice simulator you talk to in the browser. No phone line is connected and it does not answer real calls.</li>
                </ul>
              </article>
              <article className="lp-honest-col lp-reveal">
                <h3><span className="lp-tag lp-tag--no">Not offered</span></h3>
                <ul>
                  <li><X size={17} aria-hidden /> Text messages (SMS)</li>
                  <li><X size={17} aria-hidden /> Live phone calls</li>
                  <li><X size={17} aria-hidden /> Checking that a phone number or email really belongs to the visitor</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section" id="pricing">
          <div className="lp-wrap lp-center">
            <div className="lp-reveal">
              <span className="lp-eyebrow">Pricing</span>
              <h2>Simple pricing. <span className="lp-muted">Start free.</span></h2>
              <p className="lp-lead">Pick the plan that fits your monthly chat volume. No credit card to start. One chat is one visitor conversation. Prices are in US dollars.</p>
            </div>
            <div className="lp-prices">
              <article className="lp-price lp-reveal">
                <h3>Free</h3>
                <div className="lp-amount">$0<small>/month</small></div>
                <div className="lp-chats">20 chats / month</div>
                <ul>
                  <li><Check size={18} aria-hidden /> AI website chat widget</li>
                  <li><Check size={18} aria-hidden /> Lead capture with phone and email validation</li>
                </ul>
                <a className="lp-btn lp-btn--ghost lp-btn--block" href="/signup">Start free <ArrowRight size={16} aria-hidden /></a>
              </article>
              <article className="lp-price lp-price--pop lp-reveal">
                <span className="lp-pop">ADDS THE CRM</span>
                <h3>Starter</h3>
                <div className="lp-amount">$19<small>/month</small></div>
                <div className="lp-chats">250 chats / month</div>
                <ul>
                  <li><Check size={18} aria-hidden /> Everything in Free</li>
                  <li><Check size={18} aria-hidden /> CRM leads board</li>
                  <li><Check size={18} aria-hidden /> Scheduled email follow-ups (200 per month)</li>
                </ul>
                <a className="lp-btn lp-btn--primary lp-btn--block" href="/signup">Get started <ArrowRight size={16} aria-hidden /></a>
              </article>
              <article className="lp-price lp-reveal">
                <h3>Pro</h3>
                <div className="lp-amount">$39<small>/month</small></div>
                <div className="lp-chats">1,000 chats / month</div>
                <ul>
                  <li><Check size={18} aria-hidden /> Everything in Starter</li>
                  <li><Check size={18} aria-hidden /> All agents and features (the voice agent is a preview)</li>
                  <li><Check size={18} aria-hidden /> Scheduled email follow-ups (1,000 per month)</li>
                </ul>
                <a className="lp-btn lp-btn--ghost lp-btn--block" href="/signup">Get started <ArrowRight size={16} aria-hidden /></a>
              </article>
            </div>
            <p className="lp-price-note lp-reveal">Upgrade or cancel any time from your account.</p>
          </div>
        </section>

        <section className="lp-section" id="faq">
          <div className="lp-wrap lp-faq-wrap">
            <div className="lp-head lp-reveal">
              <h2>Questions <span className="lp-muted">contractors ask.</span></h2>
            </div>
            <div className="lp-faq lp-reveal">
              <details>
                <summary>How do I add it to my website?</summary>
                <p>After you sign up, copy one script tag from your account and paste it into your site. It works on any site where you can add a script tag.</p>
              </details>
              <details>
                <summary>Does RoofFlow call or text homeowners?</summary>
                <p>No. The chat happens on your website and you follow up yourself. On Starter and Pro you can also schedule follow-up emails. Text messages are not offered, and the voice agent is a browser simulator with no phone line behind it.</p>
              </details>
              <details>
                <summary>What does the homeowner agree to?</summary>
                <p>The chat asks for explicit permission to follow up before the inquiry is submitted. Follow-up emails only go to leads who agreed, include an unsubscribe link, and show your business mailing address.</p>
              </details>
              <details>
                <summary>Do you verify phone numbers and emails?</summary>
                <p>We check that they are in a valid format. We don&apos;t verify that they belong to the person who typed them.</p>
              </details>
              <details>
                <summary>Who can see my leads?</summary>
                <p>Only people in your workspace. You can invite up to 10 teammates as admins or members. Other companies cannot see your leads or conversations.</p>
              </details>
              <details>
                <summary>Do I need a credit card to start?</summary>
                <p>No. The Free plan includes 20 chats a month with no card. You can upgrade or cancel any time from your account.</p>
              </details>
              <details>
                <summary>Does the demo on this page save my messages?</summary>
                <p>No. It is a public product demo that never saves anything to a CRM, so please don&apos;t enter personal details.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-cta lp-reveal">
              <h2>Put a chat on your site <span className="lp-grad">today.</span></h2>
              <p className="lp-lead">Create a free workspace, paste one line of code, and let the next roof inquiry land in your CRM.</p>
              <div className="lp-ctas">
                <a className="lp-btn lp-btn--primary" href="/signup">Start free, no credit card <ArrowRight size={18} aria-hidden /></a>
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
            <a href="#faq">FAQ</a>
            <a href="/login">Sign in</a>
          </nav>
          <span>&copy; 2026 RoofFlow AI</span>
        </div>
      </footer>
    </div>
  );
};
