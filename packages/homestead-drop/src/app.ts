/**
 * The drop box: a public place a phone can leave a link, which a Homestead
 * behind a login comes and collects.
 *
 * It exists because an iPhone's share sheet can only reach Homestead through
 * a Shortcut, and a Shortcut can't sign in to the login (Cloudflare Access)
 * in front of a Homestead. So the Shortcut posts here instead, and Homestead
 * — which can reach out even though nothing can reach in — asks for what's
 * waiting about once a minute.
 *
 * Built on the assumption that this server can be broken into. It never calls
 * Homestead and holds nothing of Homestead's: no token, no address, no list
 * of people. A key is known here only by its hash (a box id). Its one secret
 * guards its own admin routes. The worst someone in control of it can do is
 * read links in passing and hand Homestead links of their own, which
 * Homestead treats as untrusted and caps.
 *
 *   POST   /in/<key>            { "url": … }   a Shortcut leaves a link
 *   PUT    /boxes/<box>                         Homestead registers a box
 *   DELETE /boxes/<box>                         …removes it, and what's in it
 *   GET    /boxes/<box>/links                   …lists what's waiting
 *   POST   /boxes/<box>/ack     { "through": seq }   …and forgets what it took
 *
 * The first is public. The rest need `Authorization: Bearer <admin secret>`.
 */

import type { Store } from './store';

/** Links one box may hold uncollected: a phone shares a few, not hundreds. */
export const MAX_PENDING = 50;
/** Links handed over per collection. */
export const MAX_PAGE = 50;
/** The longest address kept; longer is not a link someone shared. */
export const MAX_URL_LENGTH = 2000;
/** The largest request body read. */
export const MAX_BODY_BYTES = 4096;
/** How long an uncollected link is kept. */
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** A key as a Shortcut sends it: long and random, URL-safe. */
const KEY = /^[A-Za-z0-9_-]{32,128}$/;
/** A box id: the key's SHA-256, in hex. */
const BOX = /^[0-9a-f]{64}$/;

export interface DropBoxDeps {
  store: Store;
  /** Guards the admin routes. With none set, they refuse everyone. */
  adminSecret: string | undefined;
  /** Whether this sender may post right now; omitted where nothing limits them. */
  allow?: (sender: string) => Promise<boolean>;
  now?: () => number;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const refuse = (status: number, error: string, headers?: Record<string, string>) => json(status, { error }, headers);

async function sha256Bytes(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** The box a key opens: its SHA-256 in hex. Shared with Homestead, which computes the same. */
export async function boxOf(key: string): Promise<string> {
  return Array.from(await sha256Bytes(key), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Whether two secrets match, in time that doesn't depend on where they differ. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Bytes(given), sha256Bytes(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

async function isAdmin(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const given = /^Bearer (.+)$/i.exec(header)?.[1];
  return given ? sameSecret(given, secret) : false;
}

/** A request's JSON body, or null when it is missing, too large, or not an object. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The address as it will be kept, or null when it isn't a plain web link. */
export function webLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const href = url.toString();
    return href.length > MAX_URL_LENGTH ? null : href;
  } catch {
    return null;
  }
}

async function leaveLink(request: Request, key: string, deps: DropBoxDeps): Promise<Response> {
  if (!KEY.test(key)) return refuse(404, 'No such drop box.');
  if (deps.allow) {
    const sender = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (!(await deps.allow(sender))) return refuse(429, 'Too many links at once. Try again in a minute.');
  }
  const box = await boxOf(key);
  // Before reading the body: a stranger's request costs one lookup and stores nothing.
  if (!(await deps.store.hasBox(box))) return refuse(404, 'No such drop box.');

  const body = await readBody(request);
  const url = webLink(body?.url);
  if (!url) return refuse(400, 'Send JSON with a "url" that is a web link (http or https).');
  if ((await deps.store.countLinks(box)) >= MAX_PENDING) {
    return refuse(429, 'This drop box is full. It empties when Homestead next collects.');
  }
  await deps.store.addLink(box, { id: crypto.randomUUID(), url }, (deps.now ?? Date.now)());
  return json(202, { ok: true });
}

async function admin(request: Request, parts: string[], deps: DropBoxDeps): Promise<Response> {
  if (!(await isAdmin(request, deps.adminSecret))) {
    return refuse(401, 'Not allowed.', { 'www-authenticate': 'Bearer' });
  }
  const [, box, action] = parts;
  if (!box || !BOX.test(box)) return refuse(400, 'A box id is 64 hex characters.');
  const now = (deps.now ?? Date.now)();

  if (!action) {
    if (request.method === 'PUT') {
      await deps.store.putBox(box, now);
      return json(200, { ok: true });
    }
    if (request.method === 'DELETE') {
      await deps.store.deleteBox(box);
      return json(200, { ok: true });
    }
    return refuse(405, 'Use PUT or DELETE.', { allow: 'PUT, DELETE' });
  }

  if (!(await deps.store.hasBox(box))) return refuse(404, 'No such drop box.');
  if (action === 'links' && request.method === 'GET') {
    return json(200, { links: await deps.store.listLinks(box, MAX_PAGE) });
  }
  if (action === 'ack' && request.method === 'POST') {
    const through = (await readBody(request))?.through;
    if (typeof through !== 'number' || !Number.isInteger(through) || through < 0) {
      return refuse(400, 'Send JSON with "through": the seq of the last link collected.');
    }
    return json(200, { removed: await deps.store.ackLinks(box, through) });
  }
  return refuse(404, 'Not found.');
}

/** Answer one request to the drop box. */
export async function handle(request: Request, deps: DropBoxDeps): Promise<Response> {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'in' && parts.length === 2) {
      if (request.method !== 'POST') return refuse(405, 'Use POST.', { allow: 'POST' });
      return await leaveLink(request, parts[1]!, deps);
    }
    if (parts[0] === 'boxes' && parts.length >= 2 && parts.length <= 3) {
      return await admin(request, parts, deps);
    }
    // Nothing here says what this is or whose.
    return refuse(404, 'Not found.');
  } catch {
    return refuse(500, 'Something went wrong.');
  }
}

/** Forget links nobody came for (the daily sweep). */
export async function sweep(store: Store, now: number = Date.now()): Promise<number> {
  return store.purgeBefore(now - KEEP_MS);
}
