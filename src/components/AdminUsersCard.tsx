import React, { useCallback, useEffect, useState } from 'react';
import { getAdminUsers, setUserDisabled, type AdminUser } from '../lib/teamApi';

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none';
const ghost = 'rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50';
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

const tenantName = (u: AdminUser): string => {
  const t = Array.isArray(u.tenants) ? u.tenants[0] : u.tenants;
  return t?.name ?? '—';
};

/** All users on the platform: search by email, see plan and status, disable or enable. */
export const AdminUsersCard: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (query: string) => {
    const r = await getAdminUsers(query);
    if (r.ok === false) setNote({ ok: false, text: r.error });
    else setUsers(r.users);
  }, []);
  useEffect(() => { void load(''); }, [load]);

  const toggle = async (u: AdminUser) => {
    setBusy(true);
    const r = await setUserDisabled(u.user_id, !u.disabled);
    setNote(r.ok ? { ok: true, text: u.disabled ? 'User enabled.' : 'User disabled.' } : { ok: false, text: r.error });
    setBusy(false);
    if (r.ok) await load(q);
  };

  return (
    <section className="glass rounded-xl p-4 space-y-3" aria-label="All users">
      <h2 className="text-sm font-bold text-white">All users</h2>
      <div className="flex gap-2">
        <input className={input} placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(q); }} aria-label="Search users" />
        <button className={ghost} onClick={() => load(q)}>Search</button>
      </div>
      {note ? <p role="status" className={`text-xs ${note.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{note.text}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr><th className="py-1 pr-3">User</th><th className="pr-3">Workspace</th><th className="pr-3">Plan</th><th className="pr-3">Role</th><th className="pr-3">Status</th><th /></tr>
          </thead>
          <tbody className="text-slate-200">
            {users.map((u) => (
              <tr key={u.user_id} className="border-t border-slate-800">
                <td className="py-2 pr-3">{u.email}</td>
                <td className="pr-3">{tenantName(u)}</td>
                <td className="pr-3">{u.current_plan ?? 'free'}</td>
                <td className="pr-3">{ROLE_LABEL[u.role]}</td>
                <td className="pr-3">{u.disabled ? 'Disabled' : 'Active'}</td>
                <td className="py-2 text-right">
                  <button className={ghost} disabled={busy} onClick={() => toggle(u)}>{u.disabled ? 'Enable' : 'Disable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
