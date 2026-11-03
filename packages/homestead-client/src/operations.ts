import type { Http } from './http';

/** AEP-151 long-running operation, as returned by async custom methods. */
export interface Operation<T = unknown> {
  id?: string;
  path?: string;
  /** False while running; true once settled. */
  done: boolean;
  /** Present when the operation settled with a failure: an AEP-193 problem. */
  error?: { type?: string; title?: string; status?: number; detail?: unknown } | null;
  /** The result payload, present on successful completion. */
  response?: T;
  metadata?: unknown;
}

/** Thrown when an awaited operation settles with an `error` payload. */
export class OperationFailedError extends Error {
  constructor(
    message: string,
    public readonly operation: Operation,
  ) {
    super(message);
    this.name = 'OperationFailedError';
  }
}

export interface AwaitOperationOptions {
  /** Poll interval. Default 1.5s. */
  intervalMs?: number;
  /** Give up after this long. Default 2 minutes. */
  timeoutMs?: number;
  /** Abort polling (e.g. on unmount). */
  signal?: AbortSignal;
}

const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 120_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Operation polling was aborted'));
      },
      { once: true },
    );
  });
}

/**
 * Client for AEP-151 operations. Async custom methods answer with `202` + an
 * Operation instead of the result; {@link OperationsApi.await} polls one until
 * it settles and returns its `response`, letting a caller treat an async method
 * almost like a synchronous one while the operation stays visible server-side.
 */
export class OperationsApi {
  constructor(private readonly http: Http) {}

  /** Fetch an operation's current state. */
  get<T = unknown>(id: string): Promise<Operation<T>> {
    return this.http.request<Operation<T>>(`/operations/${encodeURIComponent(id)}`);
  }

  /** Poll until the operation is `done`, then return its `response`. */
  async await<T = unknown>(
    id: string,
    { intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, signal }: AwaitOperationOptions = {},
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (signal?.aborted) throw new Error('Operation polling was aborted');
      const op = await this.get<T>(id);
      if (op.done) {
        if (op.error) {
          const message =
            typeof op.error.detail === 'string' ? op.error.detail : 'Operation failed';
          throw new OperationFailedError(message, op);
        }
        return op.response as T;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Operation ${id} did not complete in time`);
      }
      await sleep(intervalMs, signal);
    }
  }
}
