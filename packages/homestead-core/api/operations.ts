/**
 * Client-side helper for AEP-151 long-running operations.
 *
 * Async custom methods answer with `202` + an Operation instead of the result.
 * `awaitOperation` polls that operation until it settles and hands back its
 * `response` — letting a caller `await` an async method almost as if it were
 * synchronous, while the operation itself stays visible in the (superuser-only)
 * Operations app.
 */

import { aepbase } from './aepbase';
import { OPERATIONS, type Operation } from '../resources/operations';

const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface AwaitOperationOptions {
  /** How often to poll. Default 1.5s. */
  intervalMs?: number;
  /** Give up after this long. Default 2 minutes. */
  timeoutMs?: number;
  /** Abort polling (e.g. on unmount). */
  signal?: AbortSignal;
}

/** Thrown when the operation settles with an `error` payload. */
export class OperationFailedError extends Error {
  constructor(
    message: string,
    public readonly operation: Operation,
  ) {
    super(message);
    this.name = 'OperationFailedError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `operations/{id}` until `done`, then return its `response` (or throw
 * {@link OperationFailedError} if it failed).
 */
export async function awaitOperation<T = unknown>(
  operationId: string,
  {
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  }: AwaitOperationOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw new Error('Operation polling was aborted');

    const operation = await aepbase.get<Operation>(OPERATIONS, operationId);

    if (operation.done) {
      if (operation.error) {
        const message =
          typeof operation.error.detail === 'string' ? operation.error.detail : 'Operation failed';
        throw new OperationFailedError(message, operation);
      }
      return operation.response as T;
    }

    if (Date.now() >= deadline) {
      throw new Error(`Operation ${operationId} did not complete in time`);
    }
    await sleep(intervalMs);
  }
}
