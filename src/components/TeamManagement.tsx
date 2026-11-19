import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Copy, KeyRound, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { AccountSecurity } from './AccountSecurity';
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
      <AccountSecurity />
      {me.canManage && <TeamCard me={me} />}
      {me.platformAdmin && <AdminCard />}
    </div>
  );
};

// ------------------------------------------------------------------ profile

const ProfileCard: React.FC<{ me: TeamMe; onSaved: () => void }> = ({ me, onSaved }) => {
  const [name, setName] = useState(me.fullName ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const saveName = async () => {
    setBusy(true);
    const r = await saveFullName(name);
    setNote(r.ok ? { ok: true, text: 'Name saved.' } : { ok: false, text: r.error });
    setBusy(false);
    if (r.ok) onSaved();
  };

  return (
    <section className="glass rounded-xl p-4 space-y-3" aria-label="My profile">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-orange-500" /> My profile
      </h3>
      <p className="text-xs text-slate-400">
        {me.email} · <Badge>{ROLE_LABEL[me.role]}</Badge>{me.companyName ? ` · ${me.companyName}` : ''}
      </p>
      <div className="flex gap-2 md:max-w-md">
        <input className={input} placeholder="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        <button className={primary} disabled={busy} onClick={saveName}>Save</button>
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
        <input className={`${input} md:flex-1`} type="email" placeholder
