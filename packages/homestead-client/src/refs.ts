import type { Http } from './http';
import { errorFromResponse } from './errors';
import type {
  DeleteOptions,
  ListOptions,
  Page,
  PageOptions,
  RecordBody,
} from './types';

/**
 * A handle to a collection of records at some path — top-level (`/gift-cards`)
 * or nested under a parent record (`/gift-cards/{id}/transactions`). Obtained
 * from `client.collection(plural)` or `record.collection(plural)`.
 */
export interface CollectionRef<T> {
  /** Read one explicit page (one round-trip), exposing the raw cursor. */
  page(options?: PageOptions): Promise<Page<T>>;
  /** Async-iterate every record, following `next_page_token` transparently. */
  list(options?: ListOptions): AsyncIterableIterator<T>;
  /** Collect every record into an array (convenience over {@link list}). */
  listAll(options?: ListOptions): Promise<T[]>;
  /** Fetch one record by id. */
  get(id: string): Promise<T>;
  /**
   * Create a record. Pass a plain object, a `FormData`, or an object containing
   * `Blob`/`File` fields (auto-assembled into multipart for file uploads).
   */
  create(body: RecordBody | FormData): Promise<T>;
  /** A handle to a single record in this collection (need not exist yet). */
  record(id: string): RecordRef<T>;
  /**
   * Invoke an AEP-136 collection-target custom method
   * (`POST /<plural>:<verb>`), sending `X-User-Id` for the gateway.
   */
  invoke<R = unknown>(verb: string, body?: RecordBody): Promise<R>;
}

/** A handle to a single record. */
export interface RecordRef<T> {
  /** The record's engine path (e.g. `/gift-cards/abc`). */
  readonly path: string;
  /** Fetch the record. */
  get(): Promise<T>;
  /** Merge-patch the record. Accepts file fields like {@link CollectionRef.create}. */
  update(patch: RecordBody | FormData): Promise<T>;
  /** Delete the record (optionally cascading with `force`). */
  delete(options?: DeleteOptions): Promise<void>;
  /** A child collection nested under this record. */
  collection<C>(plural: string): CollectionRef<C>;
  /** Download a file-field's bytes via the `:download` custom method. */
  download(field: string): Promise<Blob>;
  /**
   * Invoke an AEP-136 item-target custom method
   * (`POST /<plural>/<id>:<verb>`), sending `X-User-Id` for the gateway.
   */
  invoke<R = unknown>(verb: string, body?: RecordBody): Promise<R>;
}

/** aepbase's list envelope. */
interface ListEnvelope<T> {
  results?: T[];
  next_page_token?: string;
}

const DEFAULT_PAGE_SIZE = 100;

/**
 * If `body` carries any `Blob`/`File` field, assemble it into `FormData`
 * (scalars stringified, nested objects JSON-encoded) so callers never
 * hand-build multipart for a simple upload. Otherwise pass the object through.
 */
function encodeBody(body: RecordBody | FormData): RecordBody | FormData {
  if (body instanceof FormData) return body;
  const hasFile = Object.values(body).some((v) => v instanceof Blob);
  if (!hasFile) return body;
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) form.append(key, value);
    else if (typeof value === 'object') form.append(key, JSON.stringify(value));
    else form.append(key, String(value));
  }
  return form;
}

export class CollectionRefImpl<T> implements CollectionRef<T> {
  constructor(
    private readonly http: Http,
    /** Collection path with a leading slash, no trailing slash. */
    private readonly path: string,
  ) {}

  async page(options: PageOptions = {}): Promise<Page<T>> {
    const env = await this.http.request<ListEnvelope<T>>(this.path, {
      query: {
        max_page_size: options.pageSize ?? DEFAULT_PAGE_SIZE,
        page_token: options.pageToken,
        filter: options.filter,
        order_by: options.orderBy,
      },
    });
    return { records: env.results ?? [], nextPageToken: env.next_page_token || undefined };
  }

  async *list(options: ListOptions = {}): AsyncIterableIterator<T> {
    let pageToken: string | undefined;
    do {
      const page = await this.page({ ...options, pageToken });
      yield* page.records;
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  async listAll(options: ListOptions = {}): Promise<T[]> {
    const out: T[] = [];
    for await (const record of this.list(options)) out.push(record);
    return out;
  }

  get(id: string): Promise<T> {
    return this.http.request<T>(`${this.path}/${encodeURIComponent(id)}`);
  }

  create(body: RecordBody | FormData): Promise<T> {
    return this.http.request<T>(this.path, { method: 'POST', body: encodeBody(body) });
  }

  record(id: string): RecordRef<T> {
    return new RecordRefImpl<T>(this.http, `${this.path}/${encodeURIComponent(id)}`);
  }

  invoke<R = unknown>(verb: string, body?: RecordBody): Promise<R> {
    return this.http.request<R>(`${this.path}:${verb}`, {
      method: 'POST',
      body,
      includeUserId: true,
    });
  }
}

export class RecordRefImpl<T> implements RecordRef<T> {
  constructor(
    private readonly http: Http,
    public readonly path: string,
  ) {}

  get(): Promise<T> {
    return this.http.request<T>(this.path);
  }

  update(patch: RecordBody | FormData): Promise<T> {
    const body = encodeBody(patch);
    return this.http.request<T>(this.path, {
      method: 'PATCH',
      body,
      // Multipart updates must not carry the merge-patch content type.
      mergePatch: !(body instanceof FormData),
    });
  }

  async delete(options: DeleteOptions = {}): Promise<void> {
    await this.http.request<void>(this.path, {
      method: 'DELETE',
      query: options.force ? { force: 'true' } : undefined,
    });
  }

  collection<C>(plural: string): CollectionRef<C> {
    return new CollectionRefImpl<C>(this.http, `${this.path}/${plural}`);
  }

  async download(field: string): Promise<Blob> {
    const res = await this.http.raw(`${this.path}:download`, {
      method: 'POST',
      body: { field },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = undefined;
      }
      throw errorFromResponse(res.status, `${this.path}:download`, text, parsed);
    }
    return res.blob();
  }

  invoke<R = unknown>(verb: string, body?: RecordBody): Promise<R> {
    return this.http.request<R>(`${this.path}:${verb}`, {
      method: 'POST',
      body,
      includeUserId: true,
    });
  }
}
