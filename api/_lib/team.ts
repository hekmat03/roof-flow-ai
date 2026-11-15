// api/_lib/team.ts — roles, invite tokens and "who owns this workspace".
// No runtime imports except node:crypto, so tests can load it directly.
import { createHash, randomBytes } from 'node:crypto';

export type TeamRole = 'owner' | 'admin' | 'member';
export type InviteRole = 'admin' | 'member';

export const MAX_TEAM_SIZE = 10;
export const INVITE_TTL_MS = 7 * 86_400_000;
/** Supabase "ban_duration" that effectively means forever. */
export const BAN_FOREVER = '876000h';

export const isRole = (v: unknown): v is TeamRole => v === 'owner' || v === 'admin' || v === 'member';
export const isInviteRole = (v: unknown): v is InviteRole => v === 'admin' || v === 'member';
/** Rows created before migration 014 have no role: they are the workspace owner. */
export const normalizeRole = (v: unknown): TeamRole => (isRole(v) ? v : 'owner');

export const canManageTeam = (role: TeamRole): boolean => role === 'owner' || role === 'admin';
/** Who may invite whom: owners invite anyone, admins invite members only. */
export const canInviteRole = (actor: TeamRole, role: InviteRole): boolean =>
  actor === 'owner' || (actor === 'admin' && role === 'member');
/** Who may disable / enable / remove whom. Nobody touches an owner. */
export const canModerate = (actor: TeamRole, target: TeamRole): boolean => {
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  return actor === 'admin' && target === 'member';
};

export const newInviteToken = (): string => randomBytes(32).toString('base64url');
export const hashInviteToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Platform operators (you), configured with ADMIN_EMAILS=a@x.com,b@y.com. */
export const platformAdminEmails = (): string[] =>
  (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isPlatformAdmin = (email: string | null | undefined): boolean =>
  Boolean(email) && platformAdminEmails().includes((email as string).toLowerCase());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ProfileReader { from: (table: string) => any }

export interface Membership {
  userId: string;
  tenantId: string | null;
  email: string | null;
  fullName: string | null;
  role: TeamRole;
  disabled: boolean;
}

/** Null when the profile cannot be read (for example migration 014 has not been run). */
export async function getMembership(admin: ProfileReader, userId: string): Promise<Membership | null> {
  const { data, error } = await admin.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  if (!('role' in data)) return null; // migration 014 not applied yet
  return {
    userId,
    tenantId: typeof data.tenant_id === 'string' ? data.tenant_id : null,
    email: typeof data.email === 'string' ? data.email : null,
    fullName: typeof data.full_name === 'string' ? data.full_name : null,
    role: normalizeRole(data.role),
    disabled: data.disabled === true,
  };
}

/** The workspace owner's user id. Works before and after migration 014. */
export async function ownerIdForTenant(admin: ProfileReader, tenantId: string): Promise<string | null> {
  const owner = await admin.from('profiles').select('user_id').eq('tenant_id', tenantId).eq('role', 'owner').limit(1).maybeSingle();
  if (!owner.error && owner.data?.user_id) return owner.data.user_id as string;
  const first = await admin.from('profiles').select('user_id').eq('tenant_id', tenantId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  return (first.data?.user_id as string | undefined) ?? null;
}

/** Company profile, plan and billing belong to the owner; members borrow the owner's. */
export async function ownerUserId(admin: ProfileReader, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('tenant_id').eq('user_id', userId).maybeSingle();
  if (!data?.tenant_id) return userId;
  return (await ownerIdForTenant(admin, data.tenant_id as string)) ?? userId;
}
