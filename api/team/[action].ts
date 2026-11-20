// api/team/[action].ts — user management in ONE serverless function.
//   GET  me | members | admin-users
//   POST invite | revoke | accept | update-member | remove-member | profile | admin-set-disabled
// Every check happens here on the server, using the verified user's own row in
// `profiles`. Nothing the browser sends decides who someone is or what they may do.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceRateLimit } from '../_lib/rateLimit.js';
import { adminClient, userFromRequest, type AuthedUser } from '../_lib/supabaseAdmin.js';
import { appOrigin, createResendProvider, escapeHtml } from '../_lib/email.js';
import { validateEmail } from '../_lib/validators.js';
import {
  BAN_FOREVER,
  INVITE_TTL_MS,
  MAX_TEAM_SIZE,
  canInviteRole,
  canManageTeam,
  canModerate,
  getMembership,
  hashInviteToken,
  isInviteRole,
  isPlatformAdmin,
  newInviteToken,
  type Membership,
} from '../_lib/team.js';
import { evaluateEnv } from '../_lib/envCheck.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailApiKey, emailFrom, emailBaseUrl } from '../_lib/emailEnv.js';

const SETUP_ERROR = 'User management is not set up yet. Run supabase/014_user_management.sql in Supabase.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { admin: SupabaseClient; user: AuthedUser; me: Membership }

const body = (req: VercelRequest): Record<string, unknown> =>
  req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function context(req: VercelRequest, res: VercelResponse): Promise<Ctx | null> {
  const admin = adminClient();
  if (!admin) { res.status(503).json({ ok: false, error: 'Accounts are not configured on the server.' }); return null; }
  const user = await userFromRequest(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Please log in again.' }); return null; }
  const me = await getMembership(admin, user.id);
  if (!me) { res.status(503).json({ ok: false, error: SETUP_ERROR }); return null; }
  return { admin, user, me };
}

/** Same as context() but also requires an owner/admin with a workspace. */
async function managerContext(req: VercelRequest, res: VercelResponse): Promise<(Ctx & { tenantId: string }) | null> {
  const ctx = await context(req, res);
  if (!ctx) return null;
  if (!ctx.me.tenantId) { res.status(403).json({ ok: false, error: 'Your workspace has not been created yet.' }); return null; }
  if (!canManageTeam(ctx.me.role)) { res.status(403).json({ ok: false, error: 'Only owners and admins can manage the team.' }); return null; }
  return { ...ctx, tenantId: ctx.me.tenantId };
}

async function platformAdminContext(req: VercelRequest, res: VercelResponse): Promise<Ctx | null> {
  const ctx = await context(req, res);
  if (!ctx) return null;
  if (!isPlatformAdmin(ctx.user.email)) { res.status(403).json({ ok: false, error: 'Not allowed.' }); return null; }
  return ctx;
}

const setBan = async (admin: SupabaseClient, userId: string, disabled: boolean) => {
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? BAN_FOREVER : 'none' });
  if (error) console.error('team: could not update auth ban:', error.message);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await enforceRateLimit(req, res, 'team', 60))) return;

  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const isGet = req.method === 'GET';
  const isPost = req.method === 'POST';

  try {
    switch (action) {
      case 'health': return isGet ? await health(req, res) : methodNotAllowed(res);
      case 'me': return isGet ? await me(req, res) : methodNotAllowed(res);
      case 'members': return isGet ? await members(req, res) : methodNotAllowed(res);
      case 'admin-users': return isGet ? await adminUsers(req, res) : methodNotAllowed(res);
      case 'invite': return isPost ? await invite(req, res) : methodNotAllowed(res);
      case 'revoke': return isPost ? await revoke(req, res) : methodNotAllowed(res);
      case 'accept': return isPost ? await accept(req, res) : methodNotAllowed(res);
      case 'update-member': return isPost ? await updateMember(req, res) : methodNotAllowed(res);
      case 'remove-member': return isPost ? await removeMember(req, res) : methodNotAllowed(res);
      case 'profile': return isPost ? await saveProfile(req, res) : methodNotAllowed(res);
      case 'admin-set-disabled': return isPost ? await adminSetDisabled(req, res) : methodNotAllowed(res);
      default: return res.status(404).json({ ok: false, error: 'Unknown team action.' });
    }
  } catch (err) {
    console.error(`team/${action} error:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

const methodNotAllowed = (res: VercelResponse) => res.status(405).json({ ok: false, error: 'Method not allowed' });

// ---------------------------------------------------------------- health

const sameSecret = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/**
 * GET /api/team/health — "is this deployment set up correctly?"
 * Public answer: only { ok }. With HEALTH_TOKEN set in the server environment and sent as
 * ?token=... (or the x-health-token header), it also lists each variable's verdict. It
 * never returns a value, only names and plain-language verdicts.
 */
async function health(req: VercelRequest, res: VercelResponse) {
  const report = evaluateEnv(process.env);
  let database: 'ok' | 'not_configured' | 'schema_missing' | 'unreachable' = 'not_configured';
  const admin = adminClient();
  if (admin) {
    try {
      const { error } = await admin.from('tenants').select('id', { head: true, count: 'exact' }).limit(1);
      database = !error ? 'ok' : error.code === '42P01' || error.code === 'PGRST205' ? 'schema_missing' : 'unreachable';
    } catch {
      database = 'unreachable';
    }
  }
  const ok = report.requiredOk && database === 'ok';

  const expected = (process.env.HEALTH_TOKEN ?? '').trim();
  const supplied = (typeof req.query.token === 'string' ? req.query.token : '') || (typeof req.headers['x-health-token'] === 'string' ? req.headers['x-health-token'] : '');
  const detailed = expected.length >= 12 && supplied.length > 0 && sameSecret(supplied, expected);
  const status = ok ? 200 : 503;
  if (!detailed) return res.status(status).json({ ok });
  return res.status(status).json({
    ok,
    database,
    requiredOk: report.requiredOk,
    problems: report.problems,
    variables: report.results.map(({ name, level, status: s, message }) => ({ name, level, status: s, message })),
  });
}

// ---------------------------------------------------------------- reads

async function me(req: VercelRequest, res: VercelResponse) {
  const ctx = await context(req, res);
  if (!ctx) return;
  let companyName: string | null = null;
  if (ctx.me.tenantId) {
    const { data } = await ctx.admin.from('tenants').select('name').eq('id', ctx.me.tenantId).maybeSingle();
    companyName = typeof data?.name === 'string' ? data.name : null;
  }
  return res.status(200).json({
    ok: true,
    userId: ctx.user.id,
    email: ctx.user.email,
    fullName: ctx.me.fullName,
    role: ctx.me.role,
    tenantId: ctx.me.tenantId,
    companyName,
    canManage: canManageTeam(ctx.me.role),
    platformAdmin: isPlatformAdmin(ctx.user.email),
  });
}

async function members(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const [people, invites] = await Promise.all([
    ctx.admin.from('profiles').select('user_id,email,full_name,role,disabled,created_at')
      .eq('tenant_id', ctx.tenantId).order('created_at', { ascending: true }),
    ctx.admin.from('team_invites').select('id,email,role,expires_at,created_at')
      .eq('tenant_id', ctx.tenantId).is('accepted_at', null).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);
  if (people.error || invites.error) throw people.error || invites.error;
  return res.status(200).json({ ok: true, members: people.data ?? [], invites: invites.data ?? [], limit: MAX_TEAM_SIZE });
}

async function adminUsers(req: VercelRequest, res: VercelResponse) {
  const ctx = await platformAdminContext(req, res);
  if (!ctx) return;
  const q = str(req.query.q, 80).replace(/[%,()*\\]/g, '');
  let query = ctx.admin.from('profiles')
    .select('user_id,email,full_name,role,disabled,current_plan,subscription_status,created_at,tenant_id,tenants(name)')
    .order('created_at', { ascending: false }).limit(200);
  if (q) query = query.ilike('email', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return res.status(200).json({ ok: true, users: data ?? [] });
}

// --------------------------------------------------------------- invites

async function invite(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const input = body(req);
  const checked = validateEmail(input.email);
  if (checked.ok === false) return res.status(400).json({ ok: false, error: checked.error });
  const email = checked.value.toLowerCase();
  const role = input.role;
  if (!isInviteRole(role)) return res.status(400).json({ ok: false, error: 'Choose the Admin or Member role.' });
  if (!canInviteRole(ctx.me.role, role)) return res.status(403).json({ ok: false, error: 'Only the owner can invite admins.' });

  const nowIso = new Date().toISOString();
  const [people, open, existing] = await Promise.all([
    ctx.admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId),
    ctx.admin.from('team_invites').select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId).is('accepted_at', null).gt('expires_at', nowIso),
    ctx.admin.from('profiles').select('user_id').eq('tenant_id', ctx.tenantId).ilike('email', email).limit(1).maybeSingle(),
  ]);
  if (existing.data) return res.status(409).json({ ok: false, error: 'That person is already on your team.' });
  if ((people.count ?? 0) + (open.count ?? 0) >= MAX_TEAM_SIZE) {
    return res.status(409).json({ ok: false, error: `Your team is limited to ${MAX_TEAM_SIZE} people including pending invites.` });
  }

  // One open invite per email: re-inviting replaces (and re-sends) the old one.
  await ctx.admin.from('team_invites').delete().eq('tenant_id', ctx.tenantId).is('accepted_at', null).ilike('email', email);
  const token = newInviteToken();
  const { data: row, error } = await ctx.admin.from('team_invites').insert({
    tenant_id: ctx.tenantId, email, role, token_hash: hashInviteToken(token),
    invited_by: ctx.user.id, expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  }).select('id,email,role,expires_at,created_at').single();
  if (error) throw error;

  const origin = appOrigin(emailBaseUrl()) ?? appOrigin(`https://${req.headers.host ?? ''}`);
  const inviteUrl = origin ? `${origin}/invite?token=${encodeURIComponent(token)}` : null;

  let emailSent = false;
  const provider = createResendProvider(emailApiKey());
  const from = emailFrom();
  if (provider && from && inviteUrl) {
    const { data: tenant } = await ctx.admin.from('tenants').select('name').eq('id', ctx.tenantId).maybeSingle();
    const company = typeof tenant?.name === 'string' && tenant.name ? tenant.name : 'a RoofFlow workspace';
    const who = ctx.me.fullName || ctx.user.email || 'A teammate';
    const text = `${who} invited you to join ${company} on RoofFlow AI as ${role === 'admin' ? 'an admin' : 'a member'}.\n\nAccept the invitation (valid for 7 days):\n${inviteUrl}\n\nSign in or create an account with this email address (${email}) to join.`;
    const html = `<div><p>${escapeHtml(who)} invited you to join <strong>${escapeHtml(company)}</strong> on RoofFlow AI as ${role === 'admin' ? 'an admin' : 'a member'}.</p><p><a href="${escapeHtml(inviteUrl)}">Accept the invitation</a> (valid for 7 days).</p><p>Sign in or create an account with this email address (${escapeHtml(email)}) to join.</p></div>`;
    const sent = await provider.send({ from, to: email, subject: `You're invited to join ${company} on RoofFlow AI`, text, html, idempotencyKey: `team-invite-${row.id}` });
    emailSent = sent.ok;
  }

  // The link is returned ONLY to the owner/admin who created it, so they can copy it
  // when no email provider is configured.
  return res.status(200).json({ ok: true, invite: row, inviteUrl, emailSent });
}

async function revoke(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const id = str(body(req).inviteId, 60);
  if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Invalid invite.' });
  const { error } = await ctx.admin.from('team_invites').delete().eq('id', id).eq('tenant_id', ctx.tenantId).is('accepted_at', null);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

async function accept(req: VercelRequest, res: VercelResponse) {
  const ctx = await context(req, res);
  if (!ctx) return;
  const token = str(body(req).token, 120);
  if (!token) return res.status(400).json({ ok: false, error: 'This invitation link is incomplete.' });

  const { data: inv, error } = await ctx.admin.from('team_invites')
    .select('id,tenant_id,email,role').eq('token_hash', hashInviteToken(token))
    .is('accepted_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!inv) return res.status(404).json({ ok: false, error: 'This invitation is invalid or has expired. Ask for a new one.' });
  if ((ctx.user.email ?? '').toLowerCase() !== String(inv.email).toLowerCase()) {
    return res.status(403).json({ ok: false, error: `This invitation was sent to ${inv.email}. Sign in with that email address.` });
  }
  if (ctx.me.tenantId === inv.tenant_id) {
    await ctx.admin.from('team_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
    return res.status(200).json({ ok: true, already: true });
  }

  // Joining replaces the account's own (brand-new) workspace. Refuse if that
  // workspace already holds real data, so nothing is ever orphaned or deleted.
  const oldTenant = ctx.me.tenantId;
  let deleteOld = false;
  if (oldTenant) {
    const [peers, leads] = await Promise.all([
      ctx.admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('tenant_id', oldTenant),
      ctx.admin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', oldTenant),
    ]);
    if ((peers.count ?? 0) > 1 || (leads.count ?? 0) > 0) {
      return res.status(409).json({ ok: false, error: 'This account already has its own workspace with data. Use a different email address for the invitation.' });
    }
    deleteOld = true;
  }
  const { count } = await ctx.admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('tenant_id', inv.tenant_id);
  if ((count ?? 0) >= MAX_TEAM_SIZE) return res.status(409).json({ ok: false, error: 'That team is full.' });

  const { error: moveError } = await ctx.admin.from('profiles')
    .update({ tenant_id: inv.tenant_id, role: inv.role }).eq('user_id', ctx.user.id);
  if (moveError) throw moveError;
  await ctx.admin.from('team_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
  // Members never see the company-setup wizard: the owner already did it.
  await ctx.admin.from('contractor_profiles').upsert({ user_id: ctx.user.id, onboarding_complete: true }, { onConflict: 'user_id' });
  if (deleteOld && oldTenant) await ctx.admin.from('tenants').delete().eq('id', oldTenant);
  return res.status(200).json({ ok: true, role: inv.role });
}

// --------------------------------------------------------------- members

async function targetIn(ctx: Ctx & { tenantId: string }, userId: string): Promise<Membership | null> {
  if (!UUID_RE.test(userId)) return null;
  const m = await getMembership(ctx.admin, userId);
  return m && m.tenantId === ctx.tenantId ? m : null;
}

async function updateMember(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const input = body(req);
  const userId = str(input.userId, 60);
  const target = await targetIn(ctx, userId);
  if (!target) return res.status(404).json({ ok: false, error: 'That person is not on your team.' });
  if (userId === ctx.user.id) return res.status(400).json({ ok: false, error: 'You cannot change your own role or access.' });
  if (target.role === 'owner') return res.status(403).json({ ok: false, error: 'The owner cannot be changed.' });

  const patch: Record<string, unknown> = {};
  if (input.role !== undefined) {
    if (ctx.me.role !== 'owner') return res.status(403).json({ ok: false, error: 'Only the owner can change roles.' });
    if (!isInviteRole(input.role)) return res.status(400).json({ ok: false, error: 'Choose the Admin or Member role.' });
    patch.role = input.role;
  }
  if (input.disabled !== undefined) {
    if (typeof input.disabled !== 'boolean') return res.status(400).json({ ok: false, error: 'Invalid request.' });
    if (!canModerate(ctx.me.role, target.role)) return res.status(403).json({ ok: false, error: 'You cannot change this person.' });
    patch.disabled = input.disabled;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'Nothing to change.' });

  const { error } = await ctx.admin.from('profiles').update(patch).eq('user_id', userId).eq('tenant_id', ctx.tenantId);
  if (error) throw error;
  if (typeof patch.disabled === 'boolean') await setBan(ctx.admin, userId, patch.disabled);
  return res.status(200).json({ ok: true });
}

async function removeMember(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const userId = str(body(req).userId, 60);
  const target = await targetIn(ctx, userId);
  if (!target) return res.status(404).json({ ok: false, error: 'That person is not on your team.' });
  if (userId === ctx.user.id) return res.status(400).json({ ok: false, error: 'You cannot remove yourself.' });
  if (!canModerate(ctx.me.role, target.role)) return res.status(403).json({ ok: false, error: 'You cannot remove this person.' });
  // Deleting the sign-in account cascades to their profile. Shared leads stay with the workspace.
  const { error } = await ctx.admin.auth.admin.deleteUser(userId);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

async function saveProfile(req: VercelRequest, res: VercelResponse) {
  const ctx = await context(req, res);
  if (!ctx) return;
  const fullName = str(body(req).fullName, 80);
  const { error } = await ctx.admin.from('profiles').update({ full_name: fullName || null }).eq('user_id', ctx.user.id);
  if (error) throw error;
  return res.status(200).json({ ok: true, fullName: fullName || null });
}

// --------------------------------------------------------- platform admin

async function adminSetDisabled(req: VercelRequest, res: VercelResponse) {
  const ctx = await platformAdminContext(req, res);
  if (!ctx) return;
  const input = body(req);
  const userId = str(input.userId, 60);
  if (!UUID_RE.test(userId) || typeof input.disabled !== 'boolean') return res.status(400).json({ ok: false, error: 'Invalid request.' });
  if (userId === ctx.user.id) return res.status(400).json({ ok: false, error: 'You cannot disable yourself.' });
  const { data: target } = await ctx.admin.from('profiles').select('email').eq('user_id', userId).maybeSingle();
  if (!target) return res.status(404).json({ ok: false, error: 'User not found.' });
  if (isPlatformAdmin(typeof target.email === 'string' ? target.email : null)) {
    return res.status(403).json({ ok: false, error: 'Platform admins cannot be disabled here.' });
  }
  const { error } = await ctx.admin.from('profiles').update({ disabled: input.disabled }).eq('user_id', userId);
  if (error) throw error;
  await setBan(ctx.admin, userId, input.disabled);
  return res.status(200).json({ ok: true });
}
