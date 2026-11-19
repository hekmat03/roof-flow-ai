import React, { useEffect, useState } from 'react';
import { ArrowLeft, DollarSign, FileText, Shield, UserPlus, Users } from 'lucide-react';
import { navigate } from '../lib/router';
import { authHeaders } from '../lib/authFetch';
import { getMe, type AdminStats } from '../lib/teamApi';
import { AdminUsersCard } from './AdminUsersCard';

const PLAN_LABEL: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' };

async function loadStats(): Promise<{ ok: true; stats: AdminStats } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/admin-stats', { headers: await authHeaders() });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; stats?: AdminStats; error?: string };
    if (!res.ok || !data.stats) return { ok: false, error: data.error ?? 'Could not load the numbers.' };
    return { ok: true, stats: data.stats };
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
}

const Stat: React.FC<{ label: string; value: string | number; hint?: string; icon: React.ReactNode }> = ({ label, value, hint, icon }) => (
  <div className="glass rounded-xl p-4">
    <div className="flex items-center justify-between text-xs text-slate-400"><span>{label}</span>{icon}</div>
    <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
  </div>
);

/** /admin — platform operator view. The server decides access (ADMIN_EMAILS). */
export const AdminPanel: React.FC = () => {
  const [state, setState] = useState<'loading' | 'denied' | 'ready'>('loading');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = await getMe();
      if (!alive) return;
      if (me.ok === false || !me.platformAdmin) { setState('denied'); return; }
      const r = await loadStats();
      if (!alive) return;
      if (r.ok === false) setError(r.error);
      else setStats(r.stats);
      setState('ready');
    })();
    return () => { alive = false; };
  }, []);

  if (state === 'loading') return <div className="min-h-screen bg-slate-950 p-6 text-sm text-slate-400">Loading admin panel…</div>;

  if (state === 'denied') {
    return (
      <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
        <p className="text-sm">Not allowed. This page is only for platform admins.</p>
        <button className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs" onClick={() => navigate('/app')}>Back to the app</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <header className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-bold text-white"><Shield className="h-5 w-5 text-orange-500" /> Admin panel</h1>
          <button className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800" onClick={() => navigate('/app')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to app
          </button>
        </header>

        {error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : null}

        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Users" value={stats.users} hint={`${stats.newUsers7d} new in 7 days`} icon={<Users className="h-4 w-4" />} />
              <Stat label="Workspaces" value={stats.workspaces} hint={`${stats.disabledUsers} disabled users`} icon={<UserPlus className="h-4 w-4" />} />
              <Stat label="Leads" value={stats.leads} hint={`${stats.leads7d} in 7 days`} icon={<FileText className="h-4 w-4" />} />
              <Stat label="Est. MRR" value={`$${stats.mrrUsd}`} hint={`${stats.payingCustomers} paying customers`} icon={<DollarSign className="h-4 w-4" />} />
            </div>
            <section className="glass rounded-xl p-4" aria-label="Plans">
              <h2 className="mb-2 text-sm font-bold text-white">Users by plan</h2>
              <ul className="flex flex-wrap gap-2 text-xs">
                {Object.entries(stats.byPlan).map(([plan, n]) => (
                  <li key={plan} className="rounded-md bg-slate-700/60 px-2 py-1 font-semibold">{PLAN_LABEL[plan] ?? plan}: {n}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">MRR is an estimate from list prices of active, trial and past-due subscriptions. Your payment provider has the exact figures.</p>
            </section>
          </>
        ) : null}

        <AdminUsersCard />
      </div>
    </div>
  );
};

export default AdminPanel;
