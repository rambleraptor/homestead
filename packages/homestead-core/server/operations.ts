/**
 * Server-side implementation of the AEP-151 {@link OperationStore}.
 *
 * Creates and completes `operation` records through the engine over loopback,
 * using the caller's forwarded bearer token (via the server aepbase wrapper).
 * Injected into the custom-method dispatcher by the `/api/aep` gateway.
 */

import { serverClient } from './client';
import { retainToken, releaseToken } from './token-lease';
import {
  OPERATIONS,
  toOperationError,
  type CompleteOperationInput,
  type CreateOperationInput,
  type Operation,
  type OperationStore,
  type UpdateMetadataInput,
} from '../resources/operations';
import { problem } from '../resources/problem';

export const operationStore: OperationStore = {
  async create({ token, method, title, createdBy, status }: CreateOperationInput): Promise<Operation> {
    const op = await serverClient(token).collection<Operation>(OPERATIONS).create({
      done: false,
      status: status ?? 'running',
      method,
      title: title ?? method,
      created_by: createdBy ?? '',
    });
    // Hold the caller's token open until this operation settles (see complete).
    // A detached operation — one whose creator uses a short-lived, revocable
    // admin token (e.g. a cron firing) — otherwise races the revoke: its
    // start/log/complete writes fire after the token is gone and 401, stranding
    // the record. Retaining a lease keeps the token valid across the operation's
    // whole lifetime. A no-op for ordinary (unleased) user tokens.
    retainToken(token);
    return op;
  },

  async start({ token, id }: { token: string; id: string }): Promise<void> {
    await serverClient(token).collection<Operation>(OPERATIONS).record(id).update({
      status: 'running',
    });
  },

  async complete({ token, id, response, error }: CompleteOperationInput): Promise<void> {
    const patch: Record<string, unknown> =
      error !== undefined
        ? { done: true, status: 'failed', error: toOperationError(error) }
        : { done: true, status: 'succeeded', response: (response ?? {}) as Record<string, unknown> };
    try {
      await serverClient(token).collection<Operation>(OPERATIONS).record(id).update(patch);
    } finally {
      // Release the lease taken in create(), even if the terminal write failed —
      // the operation is settled either way. When this is the last reference the
      // token is finally revoked for real.
      releaseToken(token);
    }
  },

  async updateMetadata({ token, id, metadata }: UpdateMetadataInput): Promise<void> {
    // Merge-patch the `metadata` key. The engine replaces the object wholesale,
    // which is exactly what the logger wants (it sends the full logs array).
    await serverClient(token).collection<Operation>(OPERATIONS).record(id).update({ metadata });
  },
};

/**
 * Fail any operation still marked `done: false` at boot.
 *
 * Async work runs as an in-process promise, so a server restart mid-operation
 * orphans it — the record would otherwise stay `running` forever and spin the
 * UI indefinitely. Called once on boot (after the schema sync creates the
 * `operations` table) against the engine at `aepbaseUrl` with a short-lived
 * admin token. Returns the number of operations swept.
 */
export async function sweepStaleOperations({
  aepbaseUrl,
  token,
}: {
  aepbaseUrl: string;
  token: string;
}): Promise<number> {
  const headers = { Authorization: `Bearer ${token}` };

  // List every operation (paginated) and keep the ones still in flight.
  const stale: Operation[] = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ max_page_size: '200' });
    if (pageToken) qs.set('page_token', pageToken);
    const res = await fetch(`${aepbaseUrl}/operations?${qs}`, { headers });
    if (!res.ok) {
      throw new Error(`list operations failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      results?: Operation[];
      next_page_token?: string;
    };
    for (const op of body.results ?? []) {
      if (!op.done) stale.push(op);
    }
    pageToken = body.next_page_token ?? '';
  } while (pageToken);

  for (const op of stale) {
    await fetch(`${aepbaseUrl}/operations/${op.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/merge-patch+json' },
      body: JSON.stringify({
        done: true,
        status: 'failed',
        error: problem(503, 'Operation interrupted by a server restart'),
      }),
    });
  }

  return stale.length;
}
