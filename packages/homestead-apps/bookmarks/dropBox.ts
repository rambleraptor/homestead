/**
 * The drop box, as both halves of the app see it: how a key becomes a box id
 * and an address, and what counts as a link worth keeping.
 *
 * The drop box is a separate public server (`packages/homestead-drop`) that a
 * phone's shortcut posts links to, because a shortcut can't sign in to a
 * Homestead that sits behind a login. Homestead collects from it; nothing
 * there can reach in here. Pure: no I/O, safe in the browser and on the server.
 */

/** The app flag a superuser sets to the drop box's address. */
export const DROP_BOX_URL_FLAG = 'drop_box_url';

/** The credential slot holding the drop box's admin secret. */
export const DROP_BOX_SECRET_SLOT = {
  id: 'bookmarks-drop-box-secret',
  env: 'BOOKMARKS_DROP_SECRET',
} as const;

/** A box id: a key's SHA-256, in hex. */
export const BOX_ID = /^[0-9a-f]{64}$/;

/** Links Homestead will file from one inbox in an hour, whatever the drop box hands over. */
export const MAX_LINKS_PER_HOUR = 30;

const MAX_URL_LENGTH = 2000;

/** A new key for a shortcut: 32 random bytes, URL-safe. Made in the browser, shown once. */
export function newDropKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The box a key opens. The drop box computes the same from the key a shortcut sends. */
export function boxOf(key: string): Promise<string> {
  return sha256Hex(key);
}

/** The drop box's address as configured, tidied — or null when it isn't a web address. */
export function dropBoxBase(configured: unknown): string | null {
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Where a shortcut posts its links: the one value it needs. */
export function dropAddress(base: string, key: string): string {
  return `${base}/in/${key}`;
}

/**
 * A link from the drop box as a bookmark would keep it, or null. Checked here
 * again, not taken on the drop box's word: that server is assumed breakable,
 * so what it hands over is only ever a candidate.
 */
export function collectedLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The bookmark a collected link becomes always has the same id, so a re-run can't file it twice. */
export async function bookmarkIdFor(box: string, linkId: string): Promise<string> {
  return `bd${(await sha256Hex(`${box}\n${linkId}`)).slice(0, 30)}`;
}

/** The user an inbox belongs to, from its resource name (`users/{id}/bookmark-inboxes/{id}`). */
export function inboxOwner(path: string | undefined): string | null {
  const [root, userId, collection] = (path ?? '').split('/');
  return root === 'users' && userId && collection === 'bookmark-inboxes' ? userId : null;
}

/** How many links one hour's collecting has filed: what a pull's cursor carries. */
export interface CollectBudget {
  /** The hour this counts, as hours since the epoch. */
  hour: number;
  count: number;
}

/** The budget for `now`, carried over from `cursor` when it is the same hour. */
export function budgetAt(cursor: string | null, now: number): CollectBudget {
  const hour = Math.floor(now / 3_600_000);
  try {
    const saved = JSON.parse(cursor ?? '') as Partial<CollectBudget>;
    if (saved.hour === hour && typeof saved.count === 'number' && saved.count >= 0) {
      return { hour, count: saved.count };
    }
  } catch {
    // No cursor, or not ours: a fresh hour.
  }
  return { hour, count: 0 };
}
