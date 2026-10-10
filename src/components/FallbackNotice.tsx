/**
 * FallbackNotice — non-intrusive toast shown whenever the live AI tier is
 * unavailable and the built-in deterministic engine takes over.
 *
 * Listens for the "roofflow:fallback" CustomEvent dispatched by
 * src/utils/aiService.ts (server unreachable or not configured, HTTP error,
 * timeout, or empty reply). The toast self-dismisses after a few seconds and never blocks the
 * conversation UI.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Cpu } from 'lucide-react';

const FALLBACK_EVENT = 'roofflow:fallback';
const VISIBLE_MS = 4500;

export const FallbackNotice: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onFallback = () => {
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
      <div className="glass px-4 py-2.5 rounded-full flex items-center gap-2.5 shadow-xl border border-slate-700/80">
        <Cpu className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-[11px] text-slate-300 font-medium">
          Live AI unreachable — replying with the built-in offline engine.
        </span>
      </div>
    </div>
  );
};

