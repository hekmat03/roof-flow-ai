export function lemonCheckoutUrl(
  plan: 'starter' | 'pro',
  args: { email?: string; userId?: string; tenantId?: string }
): string | null {
  const base = (
    plan === 'pro'
      ? import.meta.env.VITE_LEMON_CHECKOUT_PRO
      : import.meta.env.VITE_LEMON_CHECKOUT_STARTER
  )?.trim();
  if (!base) return null;
  const u = new URL(base);
  if (args.email) u.searchParams.set('checkout[email]', args.email);
  if (args.userId) u.searchParams.set('checkout[custom][user_id]', args.userId);
  if (args.tenantId) u.searchParams.set('checkout[custom][tenant_id]', args.tenantId);
  return u.toString();
}

export function paymentsActivated(): boolean {
  return Boolean(
    import.meta.env.VITE_LEMON_CHECKOUT_STARTER?.trim() ||
      import.meta.env.VITE_LEMON_CHECKOUT_PRO?.trim()
  );
}
