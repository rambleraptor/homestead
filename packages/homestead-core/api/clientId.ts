/**
 * This tab's identity on the wire.
 *
 * Every write carries it as `X-Homestead-Client`, and the server echoes it as
 * `origin` on the change-feed event the write produces — so the tab can
 * recognise its own writes coming back and skip them (the mutation already
 * updated the cache, and applying the echo again could fight an optimistic
 * edit still in flight).
 *
 * Per tab rather than per user: the same person in two tabs should see each
 * tab's edits land in the other. Kept in sessionStorage so it survives a
 * reload, which is when a persisted offline write replays — its echo is still
 * ours.
 */

export const CLIENT_ID_HEADER = 'X-Homestead-Client';

const STORAGE_KEY = 'homestead:client-id';

function mint(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `web-${random}`;
}

function load(): string {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const fresh = mint();
    window.sessionStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // No storage (SSR, privacy mode): a per-page-load id still works.
    return mint();
  }
}

let cached: string | null = null;

export function getClientId(): string {
  cached ??= load();
  return cached;
}
