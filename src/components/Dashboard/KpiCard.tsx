import React from 'react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  /** Any CSS colour; drives the top rail and icon chip. */
  accent?: string;
  /** 0-100. When given, a thin progress bar shows this card's share. */
  share?: number;
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, hint, icon, accent = '#d4af37', share }) => (
  <article className="kpi" style={{ '--kpi-accent': accent } as React.CSSProperties}>
    <div className="flex items-start justify-between gap-3">
      <p className="eyebrow">{label}</p>
      <span className="kpi-icon" aria-hidden="true">
        {icon}
      </span>
    </div>
    <p className="tabular mt-3 text-[2rem] sm:text-4xl leading-none font-extrabold tracking-tight text-ink">{value}</p>
    <p className="mt-2 text-xs text-ink-mute">{hint}</p>
    {typeof share === 'number' && (
      <div className="mt-3 h-1.5 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden="true">
        <div
          className="bar-grow h-full rounded-full"
          style={{ width: `${String(Math.min(100, Math.max(0, share)))}%`, background: 'var(--kpi-accent)' }}
        />
      </div>
    )}
  </article>
);
