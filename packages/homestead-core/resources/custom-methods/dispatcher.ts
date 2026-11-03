/**
 * Custom-method dispatcher (AEP-136).
 *
 * Pure function consumed by the sidecar's `/api/aep` gateway route. It owns
 * the colon-verb URLs that live on a resource — `POST /<plural>:<verb>` and
 * `POST /<plural>/<id>:<verb>` — resolving each to an app-declared handler.
 *
 * Runtime-agnostic: it speaks Web `Request`/`Response`, so the same dispatcher
 * works under Bun, Next, or any Fetch-based server, and the wiring (registry
 * lookup, request authentication, aepbase passthrough) can be swapped out in
 * unit tests.
 *
 * Any colon path that isn't a registered custom method (aepbase's own
 * `:login` / `:download`, or a typo) is handed to `passthrough` so it still
 * reaches aepbase unchanged.
 */

import type {
  AsyncCustomMethodHandler,
  AsyncCustomMethodValidator,
  CustomMethodAuth,
  CustomMethodHandler,
  CustomMethodContext,
  CustomMethodTarget,
  ResourceCustomMethod,
} from '../types';
import { makeOperationLogger, type OperationStore } from '../operations';
import { runOperationJob } from '../operation-runner';
import { normalizeErrorResponse, problemResponse, toProblem } from '../problem';

export interface DispatchOptions {
  request: Request;
  /**
   * aepbase-relative path (the part after `/api/aep`), e.g.
   * `/grocery-items:process-image` or `/hsa-receipts/abc123:parse-receipt`.
   */
  path: string;
  /** Resolves a custom method by `(plural, verb)`. */
  resolveMethod: (plural: string, verb: string) => ResourceCustomMethod | undefined;
  /** Authenticates the request (custom methods always require auth). */
  authenticate: (request: Request) => Promise<CustomMethodAuth | null>;
  /**
   * Forward a non-custom-method request to aepbase untouched. Called for
   * colon paths that don't resolve to a registered method (`:login`,
   * `:download`, …) so they keep working through the gateway.
   */
  passthrough: (request: Request, path: string) => Promise<Response>;
  /**
   * AEP-151 operation store. Required only to dispatch `async: true` methods
   * (the gateway always injects it); omit it in tests that exercise only sync
   * methods.
   */
  operations?: OperationStore;
}

/** A colon URL split into its resource path and trailing custom verb. */
interface ParsedCustomMethod {
  /** The resource the method targets. */
  plural: string;
  target: CustomMethodTarget;
  /** Item id — only present for `item`-target methods. */
  id?: string;
  /** Parent chain as alternating `[plural, id, …]` segments. */
  parent: string[];
  verb: string;
}

/**
 * Split an aepbase-relative path into its resource address + custom verb.
 * Returns `null` when there is no trailing `:verb`. Shape determines the
 * target: an odd number of resource segments is a collection (`.../plural`),
 * an even number is an item (`.../plural/id`).
 */
export function parseCustomMethodPath(path: string): ParsedCustomMethod | null {
  const [resourcePath] = path.split('?', 1);
  const colon = resourcePath.lastIndexOf(':');
  if (colon === -1) return null;
  // The colon must live in the final segment, after the last slash.
  if (resourcePath.indexOf('/', colon) !== -1) return null;

  const verb = resourcePath.slice(colon + 1);
  if (!verb) return null;

  const segments = resourcePath
    .slice(0, colon)
    .split('/')
    .filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  // Odd → collection (plural is the last segment); even → item.
  if (segments.length % 2 === 1) {
    return {
      plural: segments[segments.length - 1],
      target: 'collection',
      parent: segments.slice(0, -1),
      verb,
    };
  }
  return {
    plural: segments[segments.length - 2],
    target: 'item',
    id: segments[segments.length - 1],
    parent: segments.slice(0, -2),
    verb,
  };
}

/**
 * Resolve the custom method, enforce method + auth, then invoke the
 * lazy-loaded handler. Falls back to `passthrough` for colon paths that
 * aren't registered custom methods. Always returns a `Response`; errors
 * thrown by the handler are caught and surfaced as 500.
 */
export async function dispatchCustomMethod({
  request,
  path,
  resolveMethod,
  authenticate,
  passthrough,
  operations,
}: DispatchOptions): Promise<Response> {
  const parsed = parseCustomMethodPath(path);
  if (!parsed) return passthrough(request, path);

  const method = resolveMethod(parsed.plural, parsed.verb);
  // Not ours (e.g. aepbase's `:login` / `:download`) or a target mismatch —
  // let aepbase have it.
  if (!method || (method.target ?? 'collection') !== parsed.target) {
    return passthrough(request, path);
  }

  const expectedMethod = method.method ?? 'POST';
  if (request.method !== expectedMethod) {
    return problemResponse(405, `${parsed.plural}:${parsed.verb} accepts ${expectedMethod}`, {
      Allow: expectedMethod,
    });
  }

  const auth = await authenticate(request);
  if (!auth) {
    return problemResponse(401, 'Authentication required');
  }

  let handler: CustomMethodHandler | AsyncCustomMethodHandler;
  let validate: AsyncCustomMethodValidator | undefined;
  try {
    const mod = await method.load();
    handler = mod.default;
    validate = mod.validate;
  } catch (error) {
    console.error(
      `Failed to load custom method ${parsed.plural}:${parsed.verb}:`,
      error,
    );
    return problemResponse(500, 'Failed to load custom method');
  }

  const ctx: CustomMethodContext = {
    request,
    auth,
    plural: parsed.plural,
    verb: parsed.verb,
    target: parsed.target,
    id: parsed.id,
    parent: parsed.parent,
  };

  // AEP-151 async method: create the operation, reply 202 immediately, and run
  // the handler in the background — its result becomes `response`, a throw
  // becomes `error`.
  if (method.async) {
    if (!operations) {
      console.error(
        `Async custom method ${parsed.plural}:${parsed.verb} dispatched without an operation store`,
      );
      return problemResponse(500, 'Async methods are not configured');
    }
    return dispatchAsync(ctx, handler as AsyncCustomMethodHandler, operations, {
      title: method.title,
      validate,
    });
  }

  try {
    // A handler may answer errors in any shape; callers always get a problem.
    return await normalizeErrorResponse(await (handler as CustomMethodHandler)(ctx));
  } catch (error) {
    const problem = toProblem(error);
    if (problem.status >= 500) {
      console.error(`Custom method ${parsed.plural}:${parsed.verb} threw:`, error);
    }
    return problemResponse(problem.status, problem.detail);
  }
}

/**
 * Kick off an async method: run the optional pre-flight check, create a
 * pending operation, return `202` with it, and let the handler run detached.
 * On settle, record the result (or error) against the operation so pollers see
 * `done: true`.
 */
async function dispatchAsync(
  ctx: CustomMethodContext,
  handler: AsyncCustomMethodHandler,
  operations: OperationStore,
  { title, validate }: { title?: string; validate?: AsyncCustomMethodValidator },
): Promise<Response> {
  const methodName = `${ctx.plural}:${ctx.verb}`;

  // The handler runs after we've answered with 202, by which point the original
  // body stream may be gone — and `validate` needs to read the body too. Buffer
  // the bytes once and hand each stage its own replayable Request.
  let replay: () => Request;
  try {
    replay = await bufferBody(ctx.request);
  } catch (error) {
    console.error(`Failed to read body for ${methodName}:`, error);
    return problemResponse(400, 'Could not read request body');
  }

  // Pre-flight: reject before any operation exists (AEP-151 — errors that stop
  // the operation from starting are ordinary error responses, not a 202).
  if (validate) {
    try {
      const rejection = await validate({ ...ctx, request: replay() });
      if (rejection) return await normalizeErrorResponse(rejection);
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status >= 500) console.error(`Pre-flight check for ${methodName} threw:`, error);
      return problemResponse(problem.status, problem.detail);
    }
  }

  let operation;
  try {
    operation = await operations.create({
      token: ctx.auth.token,
      method: methodName,
      title,
      createdBy: ctx.auth.user.id,
      // Created `pending`: it may wait in the runner's queue before a slot
      // frees. `start()` promotes it to `running` right before it executes.
      status: 'pending',
    });
  } catch (error) {
    console.error(`Failed to create operation for ${methodName}:`, error);
    return problemResponse(500, 'Failed to start operation');
  }

  // Per-operation logger: the handler appends progress via `ctx.log(...)`, and
  // we bracket the run with `started` / terminal entries so `metadata.logs`
  // always ends with the operation's current status.
  const logger = makeOperationLogger(operations, {
    token: ctx.auth.token,
    id: operation.id,
  });
  const bgCtx: CustomMethodContext = {
    ...ctx,
    request: replay(),
    log: (message) => logger.log(message),
  };

  // Hand the work to the shared pool (at most `HOMESTEAD_MAX_OPERATIONS` run at
  // once; the rest wait their turn as `pending`) via the shared lifecycle
  // helper. The request has already been answered with 202.
  void runOperationJob({
    store: operations,
    token: ctx.auth.token,
    operationId: operation.id,
    log: (message) => logger.log(message),
    work: () => handler(bgCtx),
    timeoutLabel: methodName,
    onError: (error) => console.error(`Async custom method ${methodName} threw:`, error),
  }).catch((error) => {
    // runOperationJob swallows its own errors; this only trips on a runner
    // internal fault. Log so it's never silent.
    console.error(`Operation runner failed for ${methodName}:`, error);
  });

  return Response.json(operation, { status: 202 });
}

/**
 * Read a request's body once and return a factory that mints a fresh, readable
 * Request per call — a body stream can only be consumed once, but the
 * pre-flight check and the background handler each need their own.
 */
async function bufferBody(request: Request): Promise<() => Request> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return () => request;
  }
  const body = await request.arrayBuffer();
  return () =>
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    });
}
