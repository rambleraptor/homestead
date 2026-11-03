/**
 * The one error format of the Homestead API.
 *
 * Every error response — the engine's, the custom-method gateway's, and each
 * custom method's own — is an RFC 9457 problem-details body carrying the
 * top-level `type` / `status` AEP-193 requires, plus the `error: { code,
 * message }` envelope the clients parse:
 *
 *   { "type": "about:blank", "title": "Not Found", "status": 404,
 *     "detail": "…", "error": { "code": 404, "message": "…" } }
 *
 * A failed long-running operation (AEP-151) carries the same problem, minus
 * the envelope, as its `error`.
 *
 * Lives in core rather than the engine so the engine, the gateway, and every
 * app's custom methods all build errors from the same function.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** HTTP reason phrases (RFC 9110) for the statuses the API emits. */
export const REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  410: 'Gone',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** An AEP-193 problem: what a failed operation's `error` holds. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
}

/** A problem response body: the problem plus the `{ error: { code, message } }` envelope. */
export interface ProblemBody extends Problem {
  error: { code: number; message: string };
}

export function problem(status: number, detail: string): Problem {
  return { type: 'about:blank', title: REASON_PHRASES[status] ?? 'Error', status, detail };
}

export function problemBody(status: number, detail: string): ProblemBody {
  return { ...problem(status, detail), error: { code: status, message: detail } };
}

export function problemResponse(
  status: number,
  detail: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(problemBody(status, detail)), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

/**
 * Throw from a custom method (sync or async) to fail with a specific status
 * rather than a 500: the dispatcher answers a sync method with it, and an async
 * method's operation records it as its `error`.
 */
export class ProblemError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProblemError';
  }
}

function statusOf(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}

/** Turn anything thrown into a problem; a status it carries is kept, else 500. */
export function toProblem(err: unknown): Problem {
  if (err instanceof Error) return problem(statusOf(err), err.message);
  if (typeof err === 'string') return problem(500, err);
  return problem(statusOf(err), messageOf(err) ?? 'Unknown error');
}

/** The human message in an error body of any shape this API has produced. */
function messageOf(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const nested = b.error as Record<string, unknown> | string | undefined;
  for (const candidate of [
    b.detail,
    b.message,
    typeof nested === 'object' && nested ? nested.message : undefined,
    typeof nested === 'string' ? nested : undefined,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return undefined;
}

/** Whether `body` is already a problem body in the standard shape. */
function isProblemBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const env = b.error as Record<string, unknown> | undefined;
  return (
    typeof b.type === 'string' &&
    typeof b.status === 'number' &&
    typeof b.detail === 'string' &&
    !!env &&
    typeof env === 'object' &&
    typeof env.message === 'string'
  );
}

/**
 * Bring a handler's error response into the standard shape, so a custom method
 * that answers `{ error: 'Bad request', message: '…' }` (or plain text) still
 * reaches callers as a problem. Successful responses, and error responses
 * already in shape, pass through untouched; headers other than the content type
 * are kept (e.g. `Allow`, `Retry-After`).
 */
export async function normalizeErrorResponse(res: Response): Promise<Response> {
  if (res.ok || res.status < 400) return res;
  const text = await res.clone().text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  if (isProblemBody(parsed)) return res;

  const detail = messageOf(parsed) ?? (text.trim() || REASON_PHRASES[res.status] || 'Error');
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'content-length') {
      headers[key] = value;
    }
  });
  return problemResponse(res.status, detail, headers);
}
