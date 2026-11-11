import { Http, type Transport } from './http';
import type { AuthStrategy } from './auth/strategy';
import { anonymous } from './auth/anonymous';
import { CollectionRefImpl, type CollectionRef } from './refs';
import { OperationsApi } from './operations';
import { AuthApi } from './auth-api';

export interface HomesteadClientOptions {
  /**
   * Server base. `''` (the default) targets the same origin (`/api/aep`), which
   * is what a browser SPA wants. A bare origin (`https://home.example.com`) is
   * fine — a trailing `/api/aep` is tolerated and de-duplicated.
   */
  baseUrl?: string;
  /** Authentication strategy. Defaults to {@link anonymous}. */
  auth?: AuthStrategy;
  /**
   * Fetch implementation. Defaults to the global `fetch`. Injectable for tests
   * and for runtimes that scope fetch differently.
   */
  fetch?: typeof fetch;
  /**
   * Tag every request with this origin (`X-Homestead-Client`). Server-side
   * writers use it to mark their own writes — e.g. a calendar import tags its
   * writes `cron:calendar-pull` so the outbound sync can tell them apart from a
   * person's edit and not echo them back. Letters, digits and `_.:-`, at most
   * 128 characters; the server ignores anything else.
   */
  origin?: string;
}

/**
 * Normalize a base to an engine root ending in exactly one `/api/aep`.
 *   ''                          → '/api/aep'         (same origin)
 *   'https://x'                 → 'https://x/api/aep'
 *   'https://x/api/aep'         → 'https://x/api/aep'
 *   'https://x/'                → 'https://x/api/aep'
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/api/aep')) return trimmed;
  return `${trimmed}/api/aep`;
}

/**
 * The Homestead client. One isomorphic entry point for CRUD, custom methods,
 * file transfer, long-running operations, and auth against a Homestead server.
 */
export class HomesteadClient {
  private readonly http: Http;
  readonly auth: AuthApi;
  readonly operations: OperationsApi;

  constructor(transport: Transport, strategy: AuthStrategy) {
    strategy.attach?.({ baseUrl: transport.baseUrl, fetch: transport.fetch });
    this.http = new Http(transport, strategy);
    this.auth = new AuthApi(this.http, transport, strategy);
    this.operations = new OperationsApi(this.http);
  }

  /** A handle to a top-level collection, e.g. `collection('gift-cards')`. */
  collection<T = Record<string, unknown>>(plural: string): CollectionRef<T> {
    return new CollectionRefImpl<T>(this.http, `/${plural}`);
  }

  /**
   * Escape hatch: an authenticated raw request against an engine-relative path
   * (everything after `/api/aep`). Returns the parsed JSON body.
   */
  request<T = unknown>(
    path: string,
    options?: Parameters<Http['request']>[1],
  ): Promise<T> {
    return this.http.request<T>(path, options);
  }

  /** Escape hatch returning the raw `Response` (e.g. for streaming). */
  raw(path: string, options?: Parameters<Http['raw']>[1]): Promise<Response> {
    return this.http.raw(path, options);
  }
}

/** Construct a {@link HomesteadClient}. */
export function createHomesteadClient(
  options: HomesteadClientOptions = {},
): HomesteadClient {
  const transport: Transport = {
    baseUrl: normalizeBaseUrl(options.baseUrl ?? ''),
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    origin: options.origin,
  };
  return new HomesteadClient(transport, options.auth ?? anonymous());
}
