import { defineConfig, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import agentResponse from './api/agent-response';
import agentRun from './api/agent-run';
import googleStatus from './api/google/status';
import googleConnect from './api/google/connect';
import googleCallback from './api/google/callback';
import googleEvents from './api/google/events';

type ApiHandler = (req: VercelRequest, res: VercelResponse) => unknown;

function developmentApiBridge(): Plugin {
  const routes = new Map<string, ApiHandler>([
    ['/api/agent-response', agentResponse],
    ['/api/agent-run', agentRun],
    ['/api/google/status', googleStatus],
    ['/api/google/connect', googleConnect],
    ['/api/google/callback', googleCallback],
    ['/api/google/events', googleEvents],
  ]);

  return {
    name: 'roofflow-development-api',
    configureServer(server) {
      server.middlewares.use(async (incoming, outgoing, next) => {
        const req = incoming as IncomingMessage & Partial<VercelRequest>;
        const url = new URL(req.url ?? '/', 'http://replit.local');
        const handler = routes.get(url.pathname);
        if (!handler) return next();

        const res = outgoing as ServerResponse;
        const response = res as unknown as VercelResponse;
        response.status = (code: number) => {
          res.statusCode = code;
          return response;
        };
        response.json = (body: unknown) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
          return response;
        };
        req.query = Object.fromEntries(url.searchParams) as VercelRequest['query'];

        if (req.method && !['GET', 'HEAD'].includes(req.method) && !req.body) {
          try {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of incoming) {
              const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              size += part.length;
              if (size > 64 * 1024) {
                response.status(413).json({ error: 'Request is too large.' });
                return;
              }
              chunks.push(part);
            }
            const text = Buffer.concat(chunks).toString('utf8');
            req.body = text ? JSON.parse(text) : {};
          } catch {
            response.status(400).json({ error: 'Request body must be valid JSON.' });
            return;
          }
        }

        try {
          await handler(req as VercelRequest, response);
          if (!res.writableEnded) {
            response.status(204);
            res.end();
          }
        } catch (error) {
          console.error('Development API error:', error);
          if (!res.writableEnded) response.status(500).json({ error: 'The service encountered an unexpected error.' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), developmentApiBridge()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
  },
});
