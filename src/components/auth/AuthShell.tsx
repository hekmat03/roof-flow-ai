import type { ReactNode } from 'react';
import { CloudLightning } from 'lucide-react';
import { navigate } from '../../lib/router';

/** Shared page frame (logo + card) for the password-reset screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-page flex items-center justify-center p-4 text-ink overflow-hidden">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gold/20 blur-[110px]" />
      <div className="relative w-full max-w-md animate-slide-up">
        <button type="button" onClick={() => navigate('/')} className="flex items-center gap-3 mx-auto mb-7" aria-label="RoofFlow AI home">
          <span className="bg-gradient-to-br from-accent-300 to-accent-500 p-2.5 rounded-xl shadow-lg shadow-gold/30">
            <CloudLightning className="h-6 w-6 text-gold-ink stroke-[2.5]" />
          </span>
          <span className="text-2xl font-black tracking-tight">Roof<span className="text-accent-400">Flow</span> AI</span>
        </button>
        <div className="bg-card/80 backdrop-blur-xl border border-line rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl shadow-black/60">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-ink-mute">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export const authInput =
  'w-full bg-inset border border-line focus:border-gold/60 focus:ring-4 focus:ring-gold/10 outline-none rounded-xl px-4 py-3 text-ink placeholder-ink-mute transition';

/** Four-segment strength bar. */
export function StrengthBar({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
  const labels = ['', 'Too weak', 'OK', 'Good', 'Strong'];
  const colors = ['', 'bg-rose-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
  if (score === 0) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= score ? colors[score] : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-mute">{labels[score]}</p>
    </div>
  );
}
