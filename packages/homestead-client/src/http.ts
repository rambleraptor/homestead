import type { AuthStrategy } from './auth/strategy';
import { errorFromResponse, HomesteadError } from './errors';

/** Where and how to reach the engine. */
export interface Transport {
  /** Engine base, already normalized to include `/api/aep`. */
  baseUrl: string;
  fetch: typeof fetch;
  /**
   * Tag sent as `X-Homestead-Client` on every request, naming the writer. The
   * server echoes it on change-feed events and hands it to resource syncs, so
   * a writer can recognise (and skip) the changes it made itself.
   */
  origin?: string;
}

/** Header carrying {@link Transport.origin}. */
export const ORIGIN_HEADER = 'X-Homestead-Client';

/** Per-request knobs understood by {@link Http.request}. */
export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  /** An object (JSON), a `FormData` (multipart), or nothing. */
  body?: Record<string, unknown> | FormData;
  /** Send the body as `application/merge-patch+json` (PATCH). */
  mergePatch?: boolean;
  /**
   * Attach the `X-User-Id` header from the auth strategy. Custom methods go
   * through the gateway, which authenticates with both the bearer token and
   * this header.
   */
  includeUserId?: boolean;
}

/**
 * The one HTTP path every operation flows through: it resolves the bearer
 * token from the auth strategy, encodes the body, normalizes errors into
 * {@link HomesteadError}, and lets a strategy react to a 401.
 */
export class Http {
  constructor(
    private readonly transport: Transport,
    private readonly strategy: AuthStrategy,
  ) {}

  /** Absolute URL for a path, used for redirect-style flows (OAuth start). */
  url(path: string): string {
    return `${this.transport.baseUrl}${path}`;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    let url = this.url(path);
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private async headers(includeUserId?: boolean): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    if (this.transport.origin) headers[ORIGIN_HEADER] = this.transport.origin;
    const token = await this.strategy.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (includeUserId && this.strategy.userId) {
      const id = await this.strategy.userId();
      if (id) headers['X-User-Id'] = id;
    }
    return headers;
  }

  private applyBody(
    init: RequestInit,
    headers: Record<string, string>,
    body: RequestOptions['body'],
    mergePatch?: boolean,
  ): void {
    if (body === undefined) return;
    if (body instanceof FormData) {
      init.body = body;
      // Let the runtime set the multipart boundary.
      return;
    }
    headers['Content-Type'] = mergePatch
      ? 'application/merge-patch+json'
      : 'application/json';
    init.body = JSON.stringify(body);
  }

  /** Issue a request and return the raw `Response` (used by file download). */
  async raw(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const headers = await this.headers(options.includeUserId);
    const init: RequestInit = { method: options.method ?? 'GET', headers };
    this.applyBody(init, headers, options.body, options.mergePatch);
    const res = await this.transport.fetch(url, init);
    if (res.status === 401) await this.strategy.onUnauthorized?.();
    return res;
  }

  /** Issue a request and parse the JSON body, throwing on a non-OK status. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const res = await this.raw(path, options);
    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body — surface the raw text through the error path below.
      }
    }
    if (!res.ok) {
      throw errorFromResponse(res.status, path, text, parsed);
    }
    return parsed as T;
  }
}

export { HomesteadError };
