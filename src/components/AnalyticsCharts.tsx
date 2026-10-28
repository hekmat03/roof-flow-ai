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
 * Styling is fully dark-amber (transparent chart bg over the glass card,
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
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { TrendingUp, Filter, CalendarRange, Percent } from 'lucide-react';
import { useApp, type Lead } from '../context/AppContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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

const darkTooltip = {
  backgroundColor: '#0f172a',
  borderColor: '#334155',
  borderWidth: 1,
  titleColor: '#f8fafc',
  bodyColor: '#cbd5e1',
  titleFont: { weight: 'bold' as const, size: 11 },
  bodyFont: { size: 11 },
  padding: 10,
  cornerRadius: 8,
  displayColors: false,
};

export const AnalyticsCharts: React.FC = () => {
  const { leads } = useApp();

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
        ...darkTooltip,
        callbacks: {
          label: ctx => `Pipeline: $${(ctx.parsed.y ?? 0).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(51,65,85,0.25)' },
        ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0, maxTicksLimit: 7 },
      },
      y: {
        grid: { color: 'rgba(51,65,85,0.25)' },
        ticks: {
          color: '#64748b',
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
        ...darkTooltip,
        callbacks: {
          label: ctx => `${(ctx.parsed.x ?? 0).toLocaleString()} at this stage`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(51,65,85,0.25)' },
        ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 5 },
        beginAtZero: true,
      },
      y: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } },
      },
    },
  };

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;
    const week = leads.filter((l) => leadDate(l).getTime() >= weekAgo).length;
    const month = leads.filter((l) => leadDate(l).getTime() >= monthAgo).length;
    const won = leads.filter((l) => l.status === 'Closed-Won' || l.status === 'Closed').length;
    const conversion = leads.length ? Math.round((won / leads.length) * 100) : 0;
    const pipeline = leads.reduce((sum, l) => sum + leadValueShare(l.status) * AVG_JOB_VALUE, 0);
    return { week, month, conversion, pipeline: Math.round(pipeline), won };
  }, [leads]);

  const donutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: { legend: { display: false }, tooltip: darkTooltip },
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Leads this week', value: kpis.week, total: Math.max(kpis.month, 1), color: '#F97316', icon: CalendarRange },
          { label: 'Leads this month', value: kpis.month, total: Math.max(leads.length, 1), color: '#fb923c', icon: TrendingUp },
          { label: 'Conversion rate', value: kpis.conversion, total: 100, color: '#10B981', suffix: '%', icon: Percent },
          { label: 'Revenue pipeline', value: kpis.pipeline, total: Math.max(kpis.pipeline, AVG_JOB_VALUE), color: '#F97316', prefix: '$', icon: Filter },
        ].map((card) => (
          <div key={card.label} className="glass card-hover rounded-2xl p-4 flex items-center gap-4 min-w-0">
            <div className="h-20 w-20 shrink-0">
              <Doughnut
                data={{
                  labels: [card.label, 'Remainder'],
                  datasets: [{
                    data: [card.value, Math.max(card.total - card.value, 0.0001)],
                    backgroundColor: [card.color, '#1e293b'],
                    borderWidth: 0,
                  }],
                }}
                options={donutOptions}
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{card.label}</p>
              <p className={`text-2xl font-black font-mono truncate ${card.label === 'Conversion rate' && kpis.conversion > 0 ? 'text-emerald-400' : 'text-white'}`}>
                {card.prefix ?? ''}{card.value.toLocaleString()}{card.suffix ?? ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-6">
      {/* Revenue Attribution */}
      <div className="xl:col-span-3 glass card-hover rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-accent-400" /> Revenue Attribution
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Estimated pipeline value from captured leads — window adapts to your CRM history
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
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
                  borderColor: '#f59e0b',
                  borderWidth: 2,
                  backgroundColor: (ctx) => {
                    const { chart } = ctx;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return 'rgba(245,158,11,0.15)';
                    const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    grad.addColorStop(0, 'rgba(245,158,11,0.35)');
                    grad.addColorStop(1, 'rgba(245,158,11,0.02)');
                    return grad;
                  },
                  tension: 0.35,
                  pointRadius: 2.5,
                  pointBackgroundColor: '#fbbf24',
                  pointBorderColor: '#0f172a',
                },
              ],
            }}
            options={revenueChartOptions}
          />
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="xl:col-span-2 glass card-hover rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Filter className="h-4.5 w-4.5 text-blue-400" /> Conversion Funnel
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Live pipeline derived from the CRM board</p>
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
                  backgroundColor: ['#334155', '#3b82f6', '#f59e0b', '#10b981'],
                  borderRadius: 6,
                  borderSkipped: false,
                  barThickness: 22,
                },
              ],
            }}
            options={funnelChartOptions}
          />
        </div>
        <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
          Impressions use a 40× site-visit default; Leads, Inspections and Closed Deals are computed live from agent-captured leads.
        </p>
      </div>
    </div>
  );
};
