import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Copy, KeyRound, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MIN_PASSWORD_LENGTH } from '../context/AuthContext';
import {
  getAdminUsers, getMe, getMembers, inviteMember, removeMember, revokeInvite,
  saveFullName, setUserDisabled, updateMember,
  type AdminUser, type TeamInvite, type TeamMe, type TeamMember,
} from '../lib/teamApi';

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none';
const btn = 'rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50';
const primary = `${btn} bg-orange-500 text-black hover:bg-orange-400`;
const ghost = `${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`;
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

const Badge: React.FC<{ children: React.ReactNode; tone?: 'ok' | 'bad' | 'plain' }> = ({ children, tone = 'plain' }) => (
  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
    tone === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : tone === 'bad' ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-700/60 text-slate-200'}`}>
    {children}
  </span>
);

const Note: React.FC<{ note: { ok: boolean; text: string } | null }> = ({ note }) =>
  note ? <p role="status" className={`text-xs ${note.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{note.text}</p> : null;

const tenantName = (u: AdminUser): string => {
  const t = Array.isArray(u.tenants) ? u.tenants[0] : u.tenants;
  return t?.name ?? '—';
};

export const TeamManagement: React.FC = () => {
  const [me, setMe] = useState<TeamMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const r = await getMe();
    if (r.ok === false) setLoadError(r.error);
    else { setMe(r); setLoadError(null); }
  }, []);
  useEffect(() => { void loadMe(); }, [loadMe]);

  if (loadError) return <div className="glass rounded-xl p-4 text-sm text-rose-300">{loadError}</div>;
  if (!me) return <div className="glass rounded-xl p-4 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-3">
      <ProfileCard me={me} onSaved={loadMe} />
      {me.canManage && <TeamCard me={me} />}
      {me.platformAdmin && <AdminCard />}
    </div>
  );
};

// ------------------------------------------------------------------ profile

const ProfileCard: React.FC<{ me: TeamMe; onSaved: () => void }> = ({ me, onSaved }) => {
  const [name, setName] = useState(me.fullName ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const saveName = async () => {
    setBusy(true);
    const r = await saveFullName(name);
    setNote(r.ok ? { ok: true, text: 'Name saved.' } : { ok: false, text: r.error });
    setBusy(false);
    if (r.ok) onSaved();
  };

  const changePassword = async () => {
    if (!supabase) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setNote({ ok: false, text: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setNote(error ? { ok: false, text: error.message } : { ok: true, text: 'Password updated.' });
    if (!error) setPassword('');
    setBusy(false);
  };

  return (
    <section className="glass rounded-xl p-4 space-y-3" aria-label="My profile">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-orange-500" /> My profile
      </h3>
      <p className="text-xs text-slate-400">
        {me.email} · <Badge>{ROLE_LABEL[me.role]}</Badge>{me.companyName ? ` · ${me.companyName}` : ''}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex gap-2">
          <input className={input} placeholder="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
          <button className={primary} disabled={busy} onClick={saveName}>Save</button>
        </div>
        <div className="flex gap-2">
          <input className={input} type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" />
          <button className={ghost} disabled={busy || !supabase || !password} onClick={changePassword}>Change</button>
        </div>
      </div>
      <Note note={note} />
    </section>
  );
};

// --------------------------------------------------------------------- team

const TeamCard: React.FC<{ me: TeamMe }> = ({ me }) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [limit, setLimit] = useState(10);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await getMembers();
    if (r.ok === false) { setNote({ ok: false, text: r.error }); return; }
    setMembers(r.members); setInvites(r.invites); setLimit(r.limit);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    const r = await work();
    setNote(r.ok ? { ok: true, text: success } : { ok: false, text: r.error ?? 'Request failed.' });
    setBusy(false);
    if (r.ok) await load();
  };

  const sendInvite = async () => {
    setBusy(true); setLink(null);
    const r = await inviteMember(email, role);
    if (r.ok === false) { setNote({ ok: false, text: r.error }); setBusy(false); return; }
    setLink(r.inviteUrl);
    setNote({ ok: true, text: r.emailSent ? `Invitation emailed to ${r.invite.email}.` : 'Invitation created. Email is not configured, so copy the link below and send it yourself.' });
    setEmail('');
    setBusy(false);
    await load();
  };

  return (
    <section className="glass rounded-xl p-4 space-y-3" aria-label="Team">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Users className="h-4 w-4 text-orange-500" /> Team <span className="text-xs font-normal text-slate-500">({members.length + invites.length}/{limit})</span>
      </h3>

      <div className="flex flex-wrap gap-2">
        <input className={`${input} md:flex-1`} type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Teammate email" />
        <select className={`${input} md:w-36`} value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')} aria-label="Role">
          <option value="member">Member</option>
          {me.role === 'owner' && <option value="admin">Admin</option>}
        </select>
        <button className={primary} disabled={busy || !email.trim()} onClick={sendInvite}>
          <UserPlus className="inline h-3.5 w-3.5 mr-1" />Invite
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Members work with leads and agents. Admins can also manage members. Only the owner changes roles and billing.</p>
      {link && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2">
          <code className="flex-1 truncate text-[11px] text-slate-300">{link}</code>
          <button className={ghost} onClick={() => navigator.clipboard?.writeText(link)}><Copy className="inline h-3.5 w-3.5 mr-1" />Copy</button>
        </div>
      )}
      <Note note={note} />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500"><tr><th className="py-1 pr-3">Person</th><th className="pr-3">Role</th><th className="pr-3">Status</th><th /></tr></thead>
          <tbody className="text-slate-200">
            {members.map((m) => {
              const self = m.user_id === me.userId;
              const locked = self || m.role === 'owner';
              const canModerate = !locked && (me.role === 'owner' || (me.role === 'admin' && m.role === 'member'));
              return (
                <tr key={m.user_id} className="border-t border-slate-800">
                  <td className="py-2 pr-3">{m.full_name ? `${m.full_name} · ` : ''}{m.email}{self ? ' (you)' : ''}</td>
                  <td className="pr-3">
                    {me.role === 'owner' && !locked ? (
                      <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5" value={m.role} disabled={busy}
                        onChange={(e) => run(() => updateMember(m.user_id, { role: e.target.value as 'admin' | 'member' }), 'Role updated.')} aria-label={`Role for ${m.email}`}>
                        <option value="member">Member</option><option value="admin">Admin</option>
                      </select>
                    ) : <Badge>{ROLE_LABEL[m.role]}</Badge>}
                  </td>
                  <td className="pr-3">{m.disabled ? <Badge tone="bad">Disabled</Badge> : <Badge tone="ok">Active</Badge>}</td>
                  <td className="py-2 text-right space-x-1 whitespace-nowrap">
                    {canModerate && (
                      <>
                        <button className={ghost} disabled={busy} onClick={() => run(() => updateMember(m.user_id, { disabled: !m.disabled }), m.disabled ? 'User enabled.' : 'User disabled.')}>
                          {m.disabled ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : <Ban className="inline h-3.5 w-3.5 mr-1" />}{m.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button className={ghost} disabled={busy} aria-label={`Remove ${m.email}`}
                          onClick={() => { if (window.confirm(`Remove ${m.email}? Their sign-in account is deleted. Shared leads stay with your workspace.`)) void run(() => removeMember(m.user_id), 'Member removed.'); }}>
                          <Trash2 className="inline h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {invites.map((i) => (
              <tr key={i.id} className="border-t border-slate-800 text-slate-400">
                <td className="py-2 pr-3">{i.email}</td>
                <td className="pr-3"><Badge>{ROLE_LABEL[i.role]}</Badge></td>
                <td className="pr-3"><Badge>Invited</Badge></td>
                <td className="py-2 text-right"><button className={ghost} disabled={busy} onClick={() => run(() => revokeInvite(i.id), 'Invitation revoked.')}>Revoke</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// -------------------------------------------------------------------- admin

const AdminCard: React.FC = () => {
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
    <section className="glass rounded-xl p-4 space-y-3" aria-label="Admin panel">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Shield className="h-4 w-4 text-orange-500" /> Admin panel — all users
      </h3>
      <div className="flex gap-2">
        <input className={input} placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(q); }} aria-label="Search users" />
        <button className={ghost} onClick={() => load(q)}>Search</button>
      </div>
      <Note note={note} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500"><tr><th className="py-1 pr-3">User</th><th className="pr-3">Workspace</th><th className="pr-3">Role</th><th className="pr-3">Plan</th><th className="pr-3">Status</th><th /></tr></thead>
          <tbody className="text-slate-200">
            {users.map((u) => (
              <tr key={u.user_id} className="border-t border-slate-800">
                <td className="py-2 pr-3">{u.email}</td>
                <td className="pr-3">{tenantName(u)}</td>
                <td className="pr-3">{ROLE_LABEL[u.role]}</td>
                <td className="pr-3">{u.current_plan ?? 'free'}</td>
                <td className="pr-3">{u.disabled ? <Badge tone="bad">Disabled</Badge> : <Badge tone="ok">Active</Badge>}</td>
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
