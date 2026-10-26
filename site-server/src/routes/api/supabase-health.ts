/**
 * GET /api/supabase-health — "is the storage layer wired up?" for the owner.
 * ---------------------------------------------------------------------------
 * Same-origin only: it reports table names, which are not secret but are not
 * anything the public web needs either. It NEVER returns the service key, and it
 * never returns row data — only reachability, the visible table list, the columns
 * of `public.leads`, and the shape of the configured key (role / project ref).
 *
 * This route is the proof for the Phase-0 exit criterion: it reads SUPABASE_URL
 * and SUPABASE_SERVICE_ROLE_KEY from this server's environment and performs a
 * trivial service-key REST query against Supabase.
 */
import { createFileRoute } from "@tanstack/react-router";
import { health } from "../../lib/supabase-admin";
import { isSameOrigin, json } from "../../lib/http";

export const Route = createFileRoute("/api/supabase-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ ok: false, error: "forbidden_origin" }, 403);
        const report = await health();
        const leadsReady = report.leadProbeStatus === 200;
        return json({
          ok: report.configured && report.restReachable,
          summary: !report.configured
            ? "Supabase is not configured in this server's environment."
            : leadsReady
              ? "Supabase is configured and answering service-key queries."
              : `Supabase is configured; the leads probe returned ${String(report.leadProbeStatus ?? "no response")}.`,
          leadsReady,
          ...report,
        });
      },
    },
  },
});
