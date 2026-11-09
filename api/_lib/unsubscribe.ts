export interface UnsubscribeStore {
  suppressAndCancel(tenantId: string, email: string): Promise<void>;
}

export async function applyUnsubscribe(
  store: UnsubscribeStore,
  identity: { tenantId: string; email: string },
): Promise<void> {
  await store.suppressAndCancel(identity.tenantId, identity.email.trim().toLowerCase());
}
