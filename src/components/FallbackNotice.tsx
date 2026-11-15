/**
 * FallbackNotice — non-intrusive toast shown whenever the live AI tier is
 * unavailable and the built-in deterministic engine takes over.
 *
 * Listens for the "roofflow:fallback" CustomEvent dispatched by
 * src/utils/aiService.ts and src/lib/agentRunner.ts (server unreachable or not
 * configured, HTTP error, timeout, or empty reply) and says WHY, using the
 * reason recorded in serviceStatus. The persistent banner (StatusBanner) carries the
 * full explanation; this toast self-dismisses and never blocks the conversation UI.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Cpu } from 'lucide-react';
import { AI_NOTICES, getServiceStatus } from '../lib/serviceStatus';

const FALLBACK_EVENT = 'roofflow:fallback';
const VISIBLE_MS = 6000;

export const FallbackNotice: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string>(AI_NOTICES.unavailable.title);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onFallback = () => {
      const reason = getServiceStatus().ai;
      setTitle(AI_NOTICES[reason ?? 'unavailable'].title);
      setVisible(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    };
    window.addEventListener(FALLBACK_EVENT, onFallback);
    return () => {
      window.removeEventListener(FALLBACK_EVENT, onFallback);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 pointer-events-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="glass-card px-4 py-2.5 rounded-full flex items-center gap-2.5 shadow-xl border border-line">
        <Cpu className="h-3.5 w-3.5 text-accent-400 shrink-0" />
        <span className="text-[11px] text-ink-soft font-medium">
          {title}. Showing a built-in reply, not live AI.
        </span>
      </div>
    </div>
  );
};
