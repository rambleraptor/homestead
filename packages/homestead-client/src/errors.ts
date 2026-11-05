/**
 * The single error type raised by every client call.
 *
 * A Homestead/aepbase server answers failures with an `{ error: { code,
 * message } }` envelope. We surface both the engine's `code` (which can differ
 * from the HTTP status — e.g. a 200-wrapped error) and the request `path` so
 * callers can log or branch without re-parsing the body. The raw parsed body
 * is kept on `body` as an escape hatch for validation-detail inspection.
 */
export class HomesteadError extends Error {
  constructor(
    /** Engine error code, falling back to the HTTP status. */
    public readonly code: number,
    message: string,
    /** The request path that failed, for logging (may include the origin). */
    public readonly path: string,
    /** The parsed response body, when it was JSON. */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'HomesteadError';
  }
}

/**
 * Back-compat alias. The three clients this library replaces threw
 * `AepbaseError`; keeping the name exported lets call sites migrate their
 * `catch (e) { if (e instanceof AepbaseError) ... }` without a rename.
 */
export { HomesteadError as AepbaseError };

/** Shape of the engine's error envelope, when present. */
interface ErrorEnvelope {
  error?: { code?: number; message?: string } | string;
  message?: string;
}

/** A proxy's HTML error page (Cloudflare, nginx) — not a message to show. */
function isHtmlPage(text: string): boolean {
  return /^\s*<(!doctype\s+html|html|head|body)\b/i.test(text);
}

/**
 * Build a {@link HomesteadError} from a non-OK response's already-read text and
 * parsed body. Prefers the envelope's `code`/`message`, then a bare string
 * `error`, then a top-level `message`, then the raw text (unless it's an HTML
 * error page), then the status.
 */
export function errorFromResponse(
  status: number,
  path: string,
  text: string,
  parsed: unknown,
): HomesteadError {
  const envelope = parsed as ErrorEnvelope | undefined;
  const errObj =
    envelope && typeof envelope.error === 'object' ? envelope.error : undefined;
  const code = errObj?.code ?? status;
  const message =
    errObj?.message ??
    (typeof envelope?.error === 'string' ? envelope.error : undefined) ??
    envelope?.message ??
    (text && !isHtmlPage(text) ? text : `HTTP ${status}`);
  return new HomesteadError(code, message, path, parsed);
}
