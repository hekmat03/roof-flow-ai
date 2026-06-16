# RoofFlow AI — Conversational Sales Simulator

**RoofFlow AI** is a specialized, interactive React-based sales console designed specifically for roofing contractors. It showcases a pre-trained suite of conversational AI sales agents that operate 24/7 to capture website leads, handle inbound calls, automated SMS/email re-engagement nurtures, and follow up with post-estimate objections to book high-value free roof inspections.

This repository implements the entire multi-agent simulation dashboard in Vite, React, and Tailwind CSS.

---

## 🚀 Application Structure & Components

The application is structured as a single-page React app leveraging a centralized `AppContext` to synchronize the global contractor settings, pre-populated mock leads database, and configurable prompt playgrounds.

```
/home/team/shared/roof-flow-ai/
├── src/
│   ├── components/
│   │   ├── Layout.tsx               # Main sidebar layout and persistent KPI counters
│   │   ├── Dashboard.tsx            # Main executive statistics and contractor funnel charts
│   │   ├── Agent1Chatbot.tsx        # Interactive Website Chatbot simulator
│   │   ├── Agent2PhoneCall.tsx      # Inbound phone-call voice assistant dialer widget
│   │   ├── Agent3SMSEmail.tsx      # Multi-day automated sequence re-engagement & email mockup
│   │   ├── Agent4Estimate.tsx       # Post-inspection estimate closer decision trees
│   │   ├── CRMLeadsBoard.tsx        # High-fidelity leads table, filtering, and audit panel
│   │   ├── Configuration.tsx        # Dynamic company parameters editor (Storm, financing, etc.)
│   │   └── PromptPlayground.tsx     # System prompt playground with template variables compiler
│   ├── context/
│   │   └── AppContext.tsx           # Global state manager, mock data layer & localStorage sync
│   ├── main.tsx                     # Entrypoint
│   └── index.css                    # Tailwind CSS v4 styling rules
```

---

## 🛠️ Deep Feature Guide

### 1. Unified CRM Mock Database (`AppContext.tsx` & `CRMLeadsBoard.tsx`)
- Operates on a structured `Lead` schema that manages:
  - Client Details (Name, Phone, Email, Property Ownership).
  - Multi-stage Workflow Statuses (`'New Lead' | 'Contacted' | 'In Contact' | 'Inspection Scheduled' | 'Inspection Completed' | 'Estimate Sent' | 'Closed-Won' | 'Closed-Lost' | 'Follow-up Nurture' | 'Closed'`).
  - Homeowner parameters (Zip Code, Roof Issue Description).
  - Interactive Appointment Details (Date, Time, and Internal Notes).
  - Conversation Log timelines tracking exact dialog paths.
- Features horizontal filter badges, multi-attribute full-text search, and full manual lead entries.
- Contains an **Inspection Appointment Panel** inside the slide-over Audit Panel that lets users manually schedule or reschedule slots, immediately writing custom System log items directly to the communication logs.

### 2. Website Lead Capture Chatbot (Agent 1)
- Mock floating web-widget simulating visit actions.
- Features automated chatbot activation in 5s.
- Guides visitors through qualification scripts (confirming property ownership, collecting phone/email, capturing storm issues).
- Employs dynamic objections handling such as "Just browsing", "Too expensive", or "Need to think about it", saving captured leads directly to the CRM.

### 3. Inbound Call Voice Handler (Agent 2)
- Simulates an interactive telephone audio interface with a dialer, wave animations, and incoming ring triggers.
- Supports stepping through qualification voice questions (insurance claim states, storm diagnostic metrics).
- Uses both typing and quick dialogue buttons to select what to say, resolving call hurdles gracefully and scheduling free inspection slots.

### 4. Re-Engagement SMS/Email Sequence (Agent 3)
- Multi-day visual timeline showcasing Touchpoints on Day 1, Day 2, Day 4, and Day 7.
- High-fidelity Email Client Mockup highlighting custom headers, logo placeholders, before-and-after photo sliders, and CTA triggers.
- Live "Trigger Flow Simulation" allowing contractors to select any lead, send arbitrary re-engagement messages, and watch the AI reply in real-time, instantly logging results.

### 5. Post-Inspection Estimate Closer (Agent 4)
- Post-estimate outreach timeline (24h financing check-in, 3-day insurance claim assistance, 1-week price match / lock-in urgency).
- Objections decision trees resolving insurance payment delays, budget constraints, or quotes comparison.
- Clicking resolution paths updates the CRM lead status to `"Closed-Won"` dynamically.

### 6. Configuration Panel & Prompt Playground
- Centralizes core business parameters (Company Name, Storm Name/Date, Financing Options, Tone).
- Updates in the settings panel dynamically propagate as live template strings across all agent prompt compilers.
- Allows live editing of System Prompt Instructions, enabling testing of custom-defined guidelines.

---

## 🏃 Getting Started & Running

### Requirements
- **NodeJS** (v18+)
- **NPM**

### Setup & Run Instructions
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server locally on port 3000:
   ```bash
   npm run dev -- --port 3000 --host 0.0.0.0
   ```
3. Compile for production:
   ```bash
   npm run build
   ```
