
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
npm test          # 3 test suites
npm run dev       # UI only (offline engine)
npx vercel dev    # UI + /api (needs MISTRAL_API_KEY in .env.local)
```

## Environment variables

See `.env.example`. Set `MISTRAL_API_KEY` in Vercel → Project Settings → Environment Variables, then redeploy. Without it the app still works using the offline engine, and Configuration shows "BUILT-IN ENGINE".

## Project layout

| Path | Purpose |
|---|---|
| `api/agent-response.ts` | Serverless endpoint (POST = reply, GET = status) |
| `api/_lib/agent.ts` | Prompts, input sanitising, rate limiter (unit-tested) |
| `src/lib/agentService.ts` | Live AI first, offline fallback second |
| `src/utils/aiService.ts` | Browser client for the endpoint |
| `src/context/AppContext.tsx` | Settings, leads, prompts (localStorage) |
| `src/components/` | Dashboard, four agent simulators, CRM board, configuration |
| `tests/` | Generator, integration and API checks |

## Roadmap

1. Server-side AI, CI and AI disclosure (done)
2. Tool-calling agent: book inspection, send SMS, update CRM, schedule follow-up
3. Supabase auth and persistent database
4. Impact dashboard and Arabic support
