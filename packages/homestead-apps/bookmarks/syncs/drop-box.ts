/**
 * Talking to the drop box (`packages/homestead-drop`) from the server: where
 * it is, the secret its admin routes want, and one bounded request.
 *
 * Every call goes out from Homestead. The drop box is assumed breakable, so
 * nothing it answers is trusted beyond "here are some candidate links".
 */

import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { resolveCredential } from '@rambleraptor/homestead-core/server/credentials';
import { DROP_BOX_SECRET_SLOT, DROP_BOX_URL_FLAG, dropBoxBase } from '../dropBox';

export interface DropBox {
  base: string;
  secret: string;
}

const TIMEOUT_MS = 10_000;
/** The `app-flags` field the address is stored under (`<app>__<key>`). */
const URL_FIELD = `bookmarks__${DROP_BOX_URL_FLAG}`;

/** The configured drop box, or null when the address or the secret isn't set. */
export async function configuredDropBox(token: string): Promise<DropBox | null> {
  const secret = resolveCredential(DROP_BOX_SECRET_SLOT)?.value;
  if (!secret) return null;
  const [flags] = await serverClient(token).collection<Record<string, unknown>>('app-flags').listAll();
  const base = dropBoxBase(flags?.[URL_FIELD]);
  return base ? { base, secret } : null;
}

/** One request to the drop box's admin routes. Rejects on a timeout or a network failure. */
export function dropBoxRequest(
  dropBox: DropBox,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${dropBox.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${dropBox.secret}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // The drop box never redirects; one that does is not ours.
    redirect: 'error',
  });
}
