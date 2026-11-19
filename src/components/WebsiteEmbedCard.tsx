import React, { useEffect, useState } from 'react';
import { Check, Copy, Globe } from 'lucide-react';
import { fetchRealLeads, type RealLeadsResult } from '../lib/realLeads';

/**
 * Shows the contractor the one line of code that puts the RoofFlow chat widget
 * on their own website. The widget key is public (it can only ADD leads to this
 * company), so it is safe to display and paste into a page.
 */
export const WebsiteEmbedCard: React.FC = () => {
  const [result, setResult] = useState<RealLeadsResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchRealLeads().then((r) => { if (live) setResult(r); });
    return () => { live = false; };
  }, []);

  if (!result || result.state === 'signed-out') return null;

  const key = result.state === 'ok' ? result.widgetKey : undefined;
  const snippet = key ? `<script src="${window.location.origin}/widget.js" data-key="${key}" async></script>` : '';

  const copy = () => {
    if (!snippet) return;
    void navigator.clipboard?.writeText(snippet).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); },
      () => undefined,
    );
  };

  return (
    <section className="glass rounded-xl p-4 space-y-2" aria-label="Add the chat widget to your website">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Globe className="h-4 w-4 text-orange-500" /> Add the chat widget to your website
      </h3>

      {snippet ? (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2">
            <code className="min-w-0 flex-1 break-all text-[11px] text-slate-300 select-all">{snippet}</code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              aria-label="Copy website code"
            >
              {copied ? <><Check className="mr-1 inline h-3.5 w-3.5" />Copied</> : <><Copy className="mr-1 inline h-3.5 w-3.5" />Copy</>}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Paste this just before the closing <code>&lt;/body&gt;</code> tag on your website (or into your site builder&rsquo;s
            &ldquo;custom code&rdquo; box), then publish. A chat bubble appears at the bottom right, and every lead it
            captures lands in this board, for your company only.
          </p>
        </>
      ) : (
        <p className="text-xs text-slate-400">
          {result.message ?? 'Your website code is not available yet. Please try again in a moment.'}
        </p>
      )}
    </section>
  );
};
