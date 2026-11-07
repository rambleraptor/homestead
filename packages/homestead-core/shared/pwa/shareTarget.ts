/**
 * Receiving files, text and links from the device's share sheet (Web Share
 * Target).
 *
 * An app opts in with `web.shareTarget` (see `AppWebConfig`), which puts a
 * `share_target` in its home-screen manifest. The OS then POSTs what was shared
 * to `<basePath>/share-target`. A page can't read a POST body, so the service
 * worker (`packages/homestead-app/public/sw.js`) answers that request itself:
 * it parks the files (and any title/text/url, as one JSON entry) in the
 * {@link SHARE_CACHE} cache under one share id and redirects to
 * `<basePath>?shared=<id>`. The app then takes them with {@link useShare}. The constants here are mirrored in `sw.js`, which is a
 * plain public file and can't import them.
 */

import { useEffect, useEffectEvent, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chromelessUrl } from '../../layout/chromeMode';

/** The path suffix the manifest's share action points at. */
export const SHARE_TARGET_SUFFIX = '/share-target';
/** The query parameter carrying a share's id back to the app. */
export const SHARED_PARAM = 'shared';
/** The Cache Storage cache the service worker parks shared files in. */
export const SHARE_CACHE = 'homestead-shared';
/** The multipart field the OS puts the files in. */
const FILES_FIELD = 'files';
/** Where the service worker parks a share's title/text/url, under its prefix. */
const TEXT_ENTRY = 'text';

/**
 * The manifest `share_target` for an app at `basePath`. The action carries
 * `?chrome=none` like the manifest's `start_url`, and the service worker keeps
 * the action's query on its redirect, so a share opens the app chromeless.
 */
export function shareTargetManifest(
  basePath: string,
  accept: string[],
  options: { text?: boolean } = {},
): Record<string, unknown> {
  const base = basePath.replace(/\/+$/, '');
  return {
    action: chromelessUrl(`${base}${SHARE_TARGET_SUFFIX}`),
    method: 'POST',
    enctype: 'multipart/form-data',
    params: {
      ...(options.text ? { title: 'title', text: 'text', url: 'url' } : {}),
      ...(accept.length ? { files: [{ name: FILES_FIELD, accept }] } : {}),
    },
  };
}

/** Text and links shared to the app; any of them may be missing. */
export interface SharedText {
  title?: string;
  text?: string;
  url?: string;
}

/**
 * A share's title, text and link as one block of text, without repeats —
 * Android often puts the link in `text` as well as `url`.
 */
export function sharedTextBody(shared: SharedText): string {
  const parts: string[] = [];
  for (const part of [shared.title, shared.text, shared.url]) {
    const value = part?.trim();
    if (value && !parts.some((p) => p.includes(value))) parts.push(value);
  }
  return parts.join('\n');
}

const SHARE_ID = /^[A-Za-z0-9-]{1,64}$/;

function sharePrefix(id: string): string {
  return `/__shared/${id}/`;
}

/**
 * The files of one share, in the order they were shared, removed from the
 * cache as they're taken — a reload of the same address finds nothing, so a
 * share is handled once. Empty when there's no such share or no Cache Storage.
 */
export async function takeSharedFiles(id: string): Promise<File[]> {
  if (!SHARE_ID.test(id) || typeof caches === 'undefined') return [];
  const cache = await caches.open(SHARE_CACHE);
  const prefix = sharePrefix(id);
  const index = (request: Request) => Number(new URL(request.url).pathname.slice(prefix.length));
  const requests = (await cache.keys())
    .filter((request) => new URL(request.url).pathname.startsWith(prefix))
    .filter((request) => !isTextEntry(request, prefix))
    .sort((a, b) => index(a) - index(b));

  const files: File[] = [];
  for (const request of requests) {
    const response = await cache.match(request);
    await cache.delete(request);
    if (!response) continue;
    const blob = await response.blob();
    const name = decodeURIComponent(response.headers.get('x-filename') ?? '') || 'shared-file';
    files.push(new File([blob], name, { type: response.headers.get('content-type') ?? blob.type }));
  }
  return files;
}

function isTextEntry(request: Request, prefix: string): boolean {
  return new URL(request.url).pathname === `${prefix}${TEXT_ENTRY}`;
}

/**
 * The text and link of one share, removed from the cache as it's taken; null
 * when the share carried none.
 */
export async function takeSharedText(id: string): Promise<SharedText | null> {
  if (!SHARE_ID.test(id) || typeof caches === 'undefined') return null;
  const cache = await caches.open(SHARE_CACHE);
  const key = `${sharePrefix(id)}${TEXT_ENTRY}`;
  const response = await cache.match(key);
  if (!response) return null;
  await cache.delete(key);
  try {
    const raw = (await response.json()) as Record<string, unknown>;
    const pick = (k: string) => (typeof raw[k] === 'string' && raw[k] ? (raw[k] as string) : undefined);
    const shared: SharedText = { title: pick('title'), text: pick('text'), url: pick('url') };
    return shared.title || shared.text || shared.url ? shared : null;
  } catch {
    return null;
  }
}

/**
 * Hand what was shared to this app (`?shared=<id>`) to its handlers, once:
 * files to `onFiles`, text and links to `onText`. The parameter is dropped from
 * the address right away so a reload or a back navigation doesn't offer the
 * share again.
 */
export function useShare(handlers: {
  onFiles?: (files: File[]) => void;
  onText?: (shared: SharedText) => void;
}): void {
  const [params, setParams] = useSearchParams();
  const id = params.get(SHARED_PARAM);
  // StrictMode runs the effect twice; a share may only be taken once.
  const taken = useRef<string | null>(null);
  const deliverFiles = useEffectEvent((files: File[]) => handlers.onFiles?.(files));
  const deliverText = useEffectEvent((shared: SharedText) => handlers.onText?.(shared));

  useEffect(() => {
    if (!id || taken.current === id) return;
    taken.current = id;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(SHARED_PARAM);
        return next;
      },
      { replace: true },
    );
    void takeSharedText(id).then((shared) => {
      if (shared) deliverText(shared);
    });
    void takeSharedFiles(id).then((files) => {
      if (files.length) deliverFiles(files);
    });
  }, [id, setParams]);
}

/** Files shared to this app (`?shared=<id>`), once — see {@link useShare}. */
export function useSharedFiles(onFiles: (files: File[]) => void): void {
  useShare({ onFiles });
}
