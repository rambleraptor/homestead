/**
 * Server-side construction of the shared {@link HomesteadClient}.
 *
 * Server code — the API routes, crons, migrations, and app workers — talks to
 * the engine over loopback with a user's forwarded bearer token, so aepbase's
 * own permissions apply. This is the one place that pairs the new client library
 * with the server's engine base ({@link AEPBASE_URL}) and a static-token auth
 * strategy, so every server caller constructs the client the same way and tests
 * have a single seam to mock. It replaces the old hand-rolled `aepGet`/`aepList`
 * free functions that used to live in `./aepbase`.
 */

import {
  createHomesteadClient,
  bearerToken,
  type CollectionRef,
  type HomesteadClient,
  type RecordRef,
} from '@rambleraptor/homestead-client';
import { AEPBASE_URL } from './aepbase';

/** Options for {@link serverClient}. */
export interface ServerClientOptions {
  /**
   * Tag this client's writes with an origin (`X-Homestead-Client`). Crons and
   * syncs pass their context's `writeOrigin` so a resource sync can recognise
   * the change as theirs — a sync never fires on its own writes, and an
   * outbound mirror can skip what an inbound import wrote.
   */
  origin?: string;
}

/**
 * A {@link HomesteadClient} bound to the engine at {@link AEPBASE_URL}, acting as
 * the holder of `token`. Pass `userId` when the caller invokes AEP-136 custom
 * methods that need the gateway's `X-User-Id` header (plain CRUD never does).
 */
export function serverClient(
  token: string,
  userId?: string,
  options: ServerClientOptions = {},
): HomesteadClient {
  return createHomesteadClient({
    baseUrl: AEPBASE_URL,
    auth: bearerToken(token, userId),
    origin: options.origin,
  });
}

/**
 * Resolve a leaf collection under an optional parent chain expressed as the
 * alternating `[plural, id, plural, id, ...]` array the old helpers took, e.g.
 * `collectionAt(hs, 'notifications', ['users', 'u1'])` → `/users/u1/notifications`.
 * With no parent it's just `hs.collection(plural)`. Keeps callers that build a
 * parent chain dynamically (the chat executor) from having to unroll the fluent
 * `record().collection()` walk themselves.
 */
export function collectionAt<T = Record<string, unknown>>(
  hs: HomesteadClient,
  plural: string,
  parent?: readonly string[],
): CollectionRef<T> {
  if (!parent || parent.length === 0) return hs.collection<T>(plural);
  let record: RecordRef<Record<string, unknown>> = hs
    .collection(parent[0])
    .record(parent[1]);
  for (let i = 2; i < parent.length; i += 2) {
    record = record.collection<Record<string, unknown>>(parent[i]).record(parent[i + 1]);
  }
  return record.collection<T>(plural);
}
