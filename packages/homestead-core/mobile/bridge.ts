/** The iOS container exposes a reply-capable handler. No secrets are persisted here. */
export interface NativeStatus {
  version: 1;
  paired: boolean;
  server?: string;
  userID?: string;
  tokenID?: string;
  features?: string[];
  showDetails?: boolean;
}
export type NativeFeature = 'groceries' | 'todos';
type NativeWindow = Window & {
  webkit?: { messageHandlers?: { homestead?: { postMessage(body: unknown): Promise<unknown> } } };
};
export function isNativeHomestead(): boolean {
  return typeof window !== 'undefined' && typeof (window as NativeWindow).webkit?.messageHandlers?.homestead?.postMessage === 'function';
}
export async function nativeRequest<T = NativeStatus>(type: string, values: Record<string, unknown> = {}): Promise<T> {
  const handler = typeof window === 'undefined' ? undefined : (window as NativeWindow).webkit?.messageHandlers?.homestead;
  if (!handler) throw new Error('This feature is available in the Homestead iOS app.');
  return await handler.postMessage({ ...values, type, version: 1 }) as T;
}
export function nativeScopes(features: NativeFeature[]) {
  if (!features.length || features.some((feature) => !['groceries', 'todos'].includes(feature))) {
    throw new Error('Choose Groceries or Todos.');
  }
  const reads = new Set<string>();
  const writes = new Set<string>();
  if (features.includes('groceries')) {
    reads.add('grocery'); reads.add('store'); writes.add('grocery');
  }
  if (features.includes('todos')) {
    for (const kind of ['todo', 'project', 'personal-todo']) reads.add(kind);
    writes.add('todo'); writes.add('personal-todo');
  }
  return [
    ...[...reads].map((resource_type) => ({ capability: 'read' as const, target_scope: 'collection' as const, resource_type })),
    ...[...writes].map((resource_type) => ({ capability: 'write' as const, target_scope: 'collection' as const, resource_type })),
  ];
}
export async function revokeNativeToken(tokenID: string, sessionToken: string): Promise<void> {
  if (!tokenID) return;
  const response = await fetch(`/api/tokens/${encodeURIComponent(tokenID)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!response.ok && response.status !== 404) throw new Error('Remote token revocation could not be confirmed. Revoke the iPhone token in Settings → Connections.');
}
/** Called before revoking the web session, since the scoped device PAT can't manage tokens. */
export async function revokeNativeDeviceOnLogout(sessionToken: string): Promise<void> {
  if (!isNativeHomestead()) return;
  try {
    const status = await nativeRequest('ready');
    if (status.tokenID) await revokeNativeToken(status.tokenID, sessionToken);
  } finally {
    await nativeRequest('disable');
  }
}
