/**
 * AnalyticsCharts — Chart.js analytics for the Dashboard.
 * ----------------------------------------------------------------------------
 * Two live charts, both derived from the shared CRM leads state
 * (AppContext), so they update the instant any simulator captures/moves a
 * lead:
 *
 *  1. Revenue Attribution (area chart) — estimated pipeline revenue over the
 *     last 14 days. Each lead contributes a status-weighted share of the
 *     $12,000 average roof job (the same average the KPI cards use):
 *       Closed-Won 100% · Estimate Sent 60% · Inspection Completed 35% ·
 *       Inspection Scheduled 25% · everything else 8%.
 *     The lead's date is its scheduledDate (or the saved chatLog's last
 *     timestamp, else today) so history accumulates realistically.
 *
 *  2. Conversion Funnel (bar chart) — Impressions → Leads → Booked
 *     Inspections → Closed Deals. Impressions use a sensible default
 *     (site-visit ≈ 40× captured leads, floor 500); every later stage is
 *     derived from real leads data.
 *
 * Styling is fully dark-amber (transparent chart bg over the glass-card card,
 * slate grid/ticks, amber & blue series) — no default white Chart.js chrome.
 * ----------------------------------------------------------------------------
 */
import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { TrendingUp, Filter } from 'lucide-react';
import { useApp, type Lead } from '../context/AppContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
);

const AVG_JOB_VALUE = 12000;

/** Status-weighted share of the average job value attributed to a lead. */
function leadValueShare(status: Lead['status']): number {
  switch (status) {
    case 'Closed-Won':
    case 'Closed':
      return 1.0;
    case 'Estimate Sent':
      return 0.6;
    case 'Inspection Completed':
      return 0.35;
    case 'Inspection Scheduled':
      return 0.25;
    default:
      return 0.08;
  }
}

/** Best-effort date for a lead: scheduledDate → last chatLog timestamp → today. */
function leadDate(lead: Lead): Date {
  const fromSchedule = lead.scheduledDate ? new Date(lead.scheduledDate) : null;
  if (fromSchedule && !isNaN(fromSchedule.getTime())) return fromSchedule;
  const lastLog = lead.chatLog?.[lead.chatLog.length - 1]?.timestamp;
  if (lastLog) {
    const parsed = new Date(lastLog);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Chart colours, derived from the theme tokens — Obsidian / Champagne Gold /
 * Cream only. No neon green, no blue: the palette is rebuilt when the theme
 * flips so the canvas never fights the CSS surface behind it.
 */
function chartPalette(theme: 'light' | 'dark') {
  const dark = theme === 'dark';
  return {
    tooltip: {
      backgroundColor: dark ? '#141414' : '#ffffff',
      borderColor: dark ? '#262626' : '#e4e4da',
      borderWidth: 1,
      titleColor: dark ? '#ffffff' : '#0a0a0a',
      bodyColor: dark ? '#d8d8d2' : '#3c3c36',
      titleFont: { weight: 'bold' as const, size: 11 },
      bodyFont: { size: 11 },
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
    },
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.08)',
    tick: dark ? '#8b8b83' : '#6b6b63',
    tickStrong: dark ? '#d8d8d2' : '#3c3c36',
    line: dark ? '#d4af37' : '#8a6f1c',
    point: dark ? '#e3c55c' : '#d4af37',
    pointBorder: dark ? '#0f0f0f' : '#ffffff',
    fillTop: dark ? 'rgba(212,175,55,0.35)' : 'rgba(138,111,28,0.22)',
    fillBottom: dark ? 'rgba(212,175,55,0.02)' : 'rgba(138,111,28,0.02)',
    bars: dark
      ? ['#2a2a2a', '#8a6f1c', '#d4af37', '#e3c55c']
      : ['#deded2', '#a98a22', '#d4af37', '#8a6f1c'],
  };
}

export const AnalyticsCharts: React.FC = () => {
  const { leads } = useApp();
  const { theme } = useTheme();
  const pal = chartPalette(theme);

  // ---- Revenue Attribution (adaptive window) ----
  // The window normally covers the last 14 days, but auto-extends back to the
  // earliest captured lead so seeded/historical CRM data still charts (bucketed
  // weekly once the span exceeds 28 days). New captures always land in the
  // newest bucket, so the chart updates live from any simulator.
  const revenueData = useMemo(() => {
    const DAY = 86400000;
    const now = Date.now();
    let minTs = now;
    for (const lead of leads) {
      const t = leadDate(lead).getTime();
      if (!isNaN(t) && t < minTs) minTs = t;
    }
    const naturalSpanDays = Math.ceil((now - minTs) / DAY);
    const spanDays = Math.max(13, Math.min(naturalSpanDays, 119)); // 14..120 days
    const useWeeks = spanDays > 28;
    const bucketMs = useWeeks ? 7 * DAY : DAY;
    const bucketCount = Math.ceil((spanDays + 1) / (useWeeks ? 7 : 1));
    const windowStart = now - bucketCount * bucketMs;

    const buckets = new Map<string, number>();
    const keys: string[] = [];
    const labelFmt = new Intl.DateTimeFormat(undefined, useWeeks
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric' });
    for (let i = 0; i < bucketCount; i++) {
      const start = windowStart + i * bucketMs;
      const key = new Date(start).toISOString().slice(0, 10);
      keys.push(key);
      buckets.set(key, 0);
    }

    for (const lead of leads) {
      const t = leadDate(lead).getTime();
      if (isNaN(t)) continue;
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((t - windowStart) / bucketMs)));
      const key = keys[idx];
      buckets.set(key, (buckets.get(key) || 0) + leadValueShare(lead.status) * AVG_JOB_VALUE);
    }

    let running = 0;
    const cumulative: number[] = [];
    for (const key of keys) {
      running += buckets.get(key) || 0;
      cumulative.push(Math.round(running));
    }

    return {
      labels: keys.map(k => labelFmt.format(new Date(k + 'T12:00:00'))),
      cumulative,
      total: running,
    };
  }, [leads]);

  // ---- Conversion Funnel ----
  const funnelData = useMemo(() => {
    const total = leads.length;
    const booked = leads.filter(l =>
      ['Inspection Scheduled', 'Inspection Completed', 'Estimate Sent', 'Closed-Won', 'Closed'].includes(l.status)
    ).length;
    const closed = leads.filter(l => l.status === 'Closed-Won' || l.status === 'Closed').length;
    const impressions = Math.max(500, total * 40);
    return {
      labels: ['Impressions', 'Leads Captured', 'Inspections Booked', 'Deals Closed'],
      values: [impressions, total, booked, closed],
    };
  }, [leads]);

  const revenueChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...pal.tooltip,
        callbacks: {
          label: ctx => `Pipeline: $${(ctx.parsed.y ?? 0).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: pal.grid },
        ticks: { color: pal.tick, font: { size: 9 }, maxRotation: 0, maxTicksLimit: 7 },
      },
      y: {
        grid: { color: pal.grid },
        ticks: {
          color: pal.tick,
          font: { size: 9 },
          callback: v => `$${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`,
        },
        beginAtZero: true,
      },
    },
  };

  const funnelChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...pal.tooltip,
        callbacks: {
          label: ctx => `${(ctx.parsed.x ?? 0).toLocaleString()} at this stage`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: pal.grid },
        ticks: { color: pal.tick, font: { size: 9 }, maxTicksLimit: 5 },
        beginAtZero: true,
      },
      y: {
        grid: { display: false },
        ticks: { color: pal.tickStrong, font: { size: 10, weight: 'bold' } },
      },
    },
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-6">
      {/* Revenue Attribution */}
      <div className="xl:col-span-3 glass-card card-hover p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-accent-400" /> Revenue Attribution
            </h3>
            <p className="text-xs text-ink-mute mt-0.5">
              Estimated pipeline value from captured leads — window adapts to your CRM history
            </p>
          </div>
          <span className="text-xs font-bold text-accent-400 bg-accent-500/10 border border-accent-500/20 px-2.5 py-1 rounded-lg">
            ${revenueData.total.toLocaleString()}
          </span>
        </div>
        <div className="h-52 sm:h-60">
          <Line
            data={{
              labels: revenueData.labels,
              datasets: [
                {
                  label: 'Cumulative pipeline value',
                  data: revenueData.cumulative,
                  fill: true,
                  borderColor: pal.line,
                  borderWidth: 2,
                  backgroundColor: (ctx) => {
                    const { chart } = ctx;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return pal.fillBottom;
                    const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    grad.addColorStop(0, pal.fillTop);
                    grad.addColorStop(1, pal.fillBottom);
                    return grad;
                  },
                  tension: 0.35,
                  pointRadius: 2.5,
                  pointBackgroundColor: pal.point,
                  pointBorderColor: pal.pointBorder,
                },
              ],
            }}
            options={revenueChartOptions}
          />
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="xl:col-span-2 glass-card card-hover p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Filter className="h-4.5 w-4.5 text-accent-400" /> Conversion Funnel
            </h3>
            <p className="text-xs text-ink-mute mt-0.5">Live pipeline derived from the CRM board</p>
          </div>
        </div>
        <div className="h-52 sm:h-60">
          <Bar
            data={{
              labels: funnelData.labels,
              datasets: [
                {
                  label: 'Stage count',
                  data: funnelData.values,
                  backgroundColor: pal.bars,
                  borderRadius: 6,
                  borderSkipped: false,
                  barThickness: 22,
                },
              ],
            }}
            options={funnelChartOptions}
          />
        </div>
        <p className="text-[10px] text-ink-mute mt-3 leading-relaxed">
          Impressions use a 40× site-visit default; Leads, Inspections and Closed Deals are computed live from agent-captured leads.
        </p>
      </div>
    </div>
  );
};
