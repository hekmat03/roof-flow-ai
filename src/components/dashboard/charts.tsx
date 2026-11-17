import React from 'react';

/**
 * Small, dependency-free chart primitives for the dashboard.
 * Every chart has a text summary for screen readers and never relies on colour
 * alone: each value is also printed as a number and a percentage.
 */

export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

const pct = (value: number, total: number): number => (total > 0 ? Math.round((value / total) * 100) : 0);

export const summarize = (title: string, data: ChartDatum[]): string => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const parts = data.filter((d) => d.value > 0).map((d) => `${d.label}: ${String(d.value)} (${String(pct(d.value, total))}%)`);
  return `${title}. ${total === 0 ? 'No data yet.' : parts.join('; ')}.`;
};

/** Horizontal bars. Best for ordered stages and category comparisons. */
export const BarList: React.FC<{ title: string; data: ChartDatum[] }> = ({ title, data }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={summarize(title, data)}>
      <ul className="space-y-3.5" aria-hidden="true">
        {data.map((d) => (
          <li key={d.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-ink-soft truncate">{d.label}</span>
              <span className="tabular shrink-0 text-ink font-bold">
                {d.value}
                <span className="ml-1.5 font-medium text-ink-mute">{pct(d.value, total)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="bar-grow h-full rounded-full"
                style={{
                  width: `${String(d.value === 0 ? 0 : Math.max(4, (d.value / max) * 100))}%`,
                  background: `linear-gradient(90deg, ${d.color}, color-mix(in srgb, ${d.color} 65%, white))`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Ring chart with the total in the middle and a legend that carries the numbers. */
export const Donut: React.FC<{
  title: string;
  data: ChartDatum[];
  centerValue: string;
  centerLabel: string;
}> = ({ title, data, centerValue, centerLabel }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 && data.filter((d) => d.value > 0).length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-5 sm:flex-row sm:gap-7 lg:flex-col lg:gap-5 xl:flex-row xl:gap-7">
      <div className="relative h-40 w-40 shrink-0" role="img" aria-label={summarize(title, data)}>
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="rgb(245 243 238 / 0.07)" strokeWidth="14" />
          {total > 0 &&
            data.map((d) => {
              if (d.value === 0) return null;
              const length = (d.value / total) * circumference;
              const dash = Math.max(0, length - gap);
              const el = (
                <circle
                  key={d.label}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth="14"
                  strokeLinecap="butt"
                  strokeDasharray={`${String(dash)} ${String(circumference - dash)}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center" aria-hidden="true">
          <div>
            <p className="tabular text-3xl font-extrabold text-ink leading-none">{centerValue}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{centerLabel}</p>
          </div>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2" aria-hidden="true">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-ink-soft">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
              <span className="truncate font-semibold">{d.label}</span>
            </span>
            <span className="tabular shrink-0 font-bold text-ink">
              {d.value}
              <span className="ml-1.5 font-medium text-ink-mute">{pct(d.value, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
