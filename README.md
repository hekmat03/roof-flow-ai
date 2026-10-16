# RoofFlow AI

AI sales agents for roofing contractors: a website chat agent, an inbound voice agent, an SMS/email follow-up agent, and a post-estimate closer, all feeding one CRM board.

Built for the **Create AI Agents Championship** (Best Business AI Agent).

## How it works

```
Browser (React + Vite)  ──POST──▶  /api/agent-response (Vercel serverless)  ──▶  Mistral AI
        │                                  ▲ keeps MISTRAL_API_KEY server-side
        └── if the API is unreachable ──▶ built-in offline engine (src/utils/aiResponseGenerator.ts)
```

- The browser never holds an AI key.
- Every agent identifies itself as an AI and never claims a booking, message or payment happened unless it was really performed.
- Leads are stored in the browser and can be pushed to a Google Sheets webhook.

## Run locally

```bash
npm install
npm test          # 5 test suites
npm run dev       # UI only (offline engine)
npx vercel dev    # UI + /api (needs MISTRAL_API_KEY in .env.local)
```

## Environment variables

See `.env.example`. Set `MISTRAL_API_KEY` in Vercel → Project Settings → Environment Variables, then redeploy. Without it the app still works using the offline engine, and Configuration shows "BUILT-IN ENGINE".

## Project layout

| Path | Purpose |
|---|---|
| `api/agent-response.ts` | Serverless endpoint (POST = reply, GET = status) |
| `api/agent-run.ts` | Tool-calling agent endpoint (POST = run, GET = capabilities) |
| `api/_lib/agent.ts` | Prompts, input sanitising, rate limiter (unit-tested) |
| `api/_lib/tools.ts` | Tools, guardrails, Supabase adapter, agent loop |
| `supabase/schema.sql` | Database tables (RLS on, server-only access) |
| `src/lib/agentRunner.ts` | Runs an agent turn with tools, offline fallback |
| `src/lib/applyActions.ts` | Turns executed actions into CRM updates |
| `src/lib/agentService.ts` | Live AI first, offline fallback second |
| `src/utils/aiService.ts` | Browser client for the endpoint |
| `src/context/AppContext.tsx` | Settings, leads, prompts (localStorage) |
| `src/components/` | Dashboard, four agent simulators, CRM board, configuration |
| `tests/` | Generator, integration and API checks |

## Agent tools and safeguards

| Tool | What it does | Honesty rule |
|---|---|---|
| `book_inspection` | Records an inspection REQUEST | Always "requested", never "confirmed" |
| `send_message` | Records an outreach intent only — no email or SMS is ever delivered | Every send is labelled simulated |
| `update_crm` | Updates the lead, handles Do Not Contact | Opt-outs block all later messages |
| `schedule_followup` | Records a follow-up for later | Stored as "scheduled", not sent |

Guards: contacts must have been given by the customer in the conversation, arguments are validated, each agent only sees its own tools, and every action appears in the Agent Actions log.

## Roadmap

1. Server-side AI, CI and AI disclosure (done)
2. Tool-calling agent: book inspection request, send email/SMS, update CRM, schedule follow-up (done for Agent 1; Agents 2-4 next)
3. Follow-up worker (cron) and Supabase auth
4. Impact dashboard and Arabic support
