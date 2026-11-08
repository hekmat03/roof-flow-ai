/**
 * /api/widget-reply — optional live-AI reply for the embeddable widget.
 * All logic (including the spend caps) lives in src/lib/widget-reply-handler.ts,
 * which is tested offline. See that file and src/lib/spend-guard.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleWidgetReplyOptions, handleWidgetReplyPost } from "../../lib/widget-reply-handler";

export const Route = createFileRoute("/api/widget-reply")({
  server: {
    handlers: {
      OPTIONS: async () => handleWidgetReplyOptions(),
      POST: async ({ request }) => handleWidgetReplyPost(request),
    },
  },
});
