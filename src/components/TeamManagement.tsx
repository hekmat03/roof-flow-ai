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
    <div className={`grid gap-3 lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] ${me.canManage || me.platformAdmin ? 'lg:grid-cols-2' : ''}`}>
      <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
        <ProfileCard me={me} onSaved={loadMe} />
        <AccountSecurity />
      </div>
      {(me.canManage || me.platformAdmin) && (
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          {me.canManage && <TeamCard me={me} />}
          {me.platformAdmin && <AdminCard />}
        </div>
      )}
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
    <section className="glass flex min-h-0 flex-col rounded-xl p-4 space-y-3 lg:flex-1" aria-label="Team">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Users className="h-4 w-4 text-orange-500" /> Team <span className="text-xs font-normal text-slate-500">({members.length + invites.length}/{limit})</span>
      </h3>

      <div className="flex flex-wrap gap-2">
        <input className={`${input} md:flex-1`} type="email" placeholder="Teammate email" value={email} maxLength={254}
          onChange={(e) => setEmail(e.target.value)} aria-label="Teammate email" />
        <select className={`${input} md:w-36`} value={role} aria-label="Role"
          onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'member')}>
          <option value="member">Member</option>
          {me.role === 'owner' && <option value="admin">Admin</option>}
        </select>
        <button className={primary} disabled={busy || !email.trim()} onClick={sendInvite}>
          <UserPlus className="mr-1 inline h-3.5 w-3.5" /> Invite
        </button>
      </div>
      <Note note={note} />

      {link && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2">
          <code className="min-w-0 flex-1 break-all text-[11px] text-slate-300">{link}</code>
          <button className={ghost} aria-label="Copy invite link"
            onClick={() => { void navigator.clipboard?.writeText(link).catch(() => undefined); }}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ul className="divide-y divide-slate-800 lg:min-h-0 lg:flex-1 lg:overflow-y-auto premium-scroll">
        {members.map((m) => {
          const isSelf = m.user_id === me.userId;
          const locked = isSelf || m.role === 'owner';
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{m.full_name || m.email || 'Unnamed user'}</p>
                {m.full_name && m.email && <p className="truncate text-xs text-slate-500">{m.email}</p>}
              </div>
              <Badge>{ROLE_LABEL[m.role]}</Badge>
              {m.disabled && <Badge tone="bad">Disabled</Badge>}
              {!locked && (
                <>
                  {me.role === 'owner' && (
                    <select className={`${input} w-28`} value={m.role === 'admin' ? 'admin' : 'member'} disabled={busy}
                      aria-label={`Role for ${m.email ?? 'user'}`}
                      onChange={(e) => void run(() => updateMember(m.user_id, { role: e.target.value === 'admin' ? 'admin' : 'member' }), 'Role updated.')}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  <button className={ghost} disabled={busy}
                    onClick={() => void run(() => updateMember(m.user_id, { disabled: !m.disabled }), m.disabled ? 'Access restored.' : 'Access disabled.')}>
                    {m.disabled ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Enable</> : <><Ban className="mr-1 inline h-3.5 w-3.5" />Disable</>}
                  </button>
                  <button className={ghost} disabled={busy} aria-label={`Remove ${m.email ?? 'user'}`}
                    onClick={() => { if (window.confirm(`Remove ${m.email ?? 'this user'} from your team?`)) void run(() => removeMember(m.user_id), 'Member removed.'); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {invites.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-400">Pending invitations</p>
          <ul className="divide-y divide-slate-800">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{inv.email}</span>
                <Badge>{ROLE_LABEL[inv.role]}</Badge>
                <span className="text-[11px] text-slate-500">expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                <button className={ghost} disabled={busy} aria-label={`Revoke invitation for ${inv.email}`}
                  onClick={() => void run(() => revokeInvite(inv.id), 'Invitation revoked.')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

// -------------------------------------------------------------- platform admin

const AdminCard: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (query: string) => {
    const r = await getAdminUsers(query);
    if (r.ok === false) { setNote({ ok: false, text: r.error }); return; }
    setUsers(r.users);
    setNote(null);
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
    <section className="glass flex min-h-0 flex-col rounded-xl p-4 space-y-3 lg:flex-1" aria-label="Platform admin">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Shield className="h-4 w-4 text-orange-500" /> Platform admin
        <span className="text-xs font-normal text-slate-500">({users.length} users)</span>
      </h3>

      <div className="flex gap-2 md:max-w-md">
        <input className={input} placeholder="Search by email or name" value={q} maxLength={80}
          onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <button className={ghost} disabled={busy} onClick={() => void load(q)}>Search</button>
      </div>
      <Note note={note} />

      <ul className="divide-y divide-slate-800 lg:min-h-0 lg:flex-1 lg:overflow-y-auto premium-scroll">
        {users.map((u) => (
          <li key={u.user_id} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{u.full_name || u.email || 'Unnamed user'}</p>
              <p className="truncate text-xs text-slate-500">{u.email ?? '—'} · {tenantName(u)}</p>
            </div>
            <Badge>{ROLE_LABEL[u.role]}</Badge>
            <Badge>{u.current_plan ?? 'free'}</Badge>
            {u.disabled && <Badge tone="bad">Disabled</Badge>}
            <button className={ghost} disabled={busy} onClick={() => void toggle(u)}>
              {u.disabled ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Enable</> : <><Ban className="mr-1 inline h-3.5 w-3.5" />Disable</>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
