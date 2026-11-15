import { authHeaders } from './authFetch';

/**
 * Client for /api/team/*. The server decides who may do what; this file only
 * sends requests (with the signed-in user's token) and returns plain results.
 */
export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamMe {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: TeamRole;
  tenantId: string | null;
  companyName: string | null;
  canManage: boolean;
  platformAdmin: boolean;
}

export interface TeamMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: TeamRole;
  disabled: boolean;
  created_at: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  expires_at: string;
  created_at: string;
}

export interface AdminUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: TeamRole;
  disabled: boolean;
  current_plan: string | null;
  subscription_status: string | null;
  created_at: string;
  tenants: { name: string | null } | { name: string | null }[] | null;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function call<T>(
  action: string,
  method: 'GET' | 'POST',
  payload?: Record<string, unknown>,
  query = '',
): Promise<Result<T>> {
  try {
    const res = await fetch(`/api/team/${action}${query}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : 'Request failed. Please try again.' };
    }
    return data as Result<T>;
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
}

export const getMe = () => call<TeamMe>('me', 'GET');
export const getMembers = () =>
  call<{ members: TeamMember[]; invites: TeamInvite[]; limit: number }>('members', 'GET');
export const inviteMember = (email: string, role: 'admin' | 'member') =>
  call<{ invite: TeamInvite; inviteUrl: string | null; emailSent: boolean }>('invite', 'POST', { email, role });
export const revokeInvite = (inviteId: string) => call<object>('revoke', 'POST', { inviteId });
export const acceptInvite = (token: string) => call<{ role?: string; already?: boolean }>('accept', 'POST', { token });
export const updateMember = (userId: string, change: { role?: 'admin' | 'member'; disabled?: boolean }) =>
  call<object>('update-member', 'POST', { userId, ...change });
export const removeMember = (userId: string) => call<object>('remove-member', 'POST', { userId });
export const saveFullName = (fullName: string) => call<{ fullName: string | null }>('profile', 'POST', { fullName });
export const getAdminUsers = (q = '') =>
  call<{ users: AdminUser[] }>('admin-users', 'GET', undefined, q ? `?q=${encodeURIComponent(q)}` : '');
export const setUserDisabled = (userId: string, disabled: boolean) =>
  call<object>('admin-set-disabled', 'POST', { userId, disabled });

const PENDING_KEY = 'roofflow:pending-invite';
export const rememberInvite = (token: string): void => {
  try { localStorage.setItem(PENDING_KEY, token); } catch { /* storage blocked */ }
};
export const pendingInvite = (): string | null => {
  try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
};
export const clearPendingInvite = (): void => {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ }
};
