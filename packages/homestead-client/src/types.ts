/** Values that may be produced synchronously or as a promise. */
export type MaybePromise<T> = T | Promise<T>;

/** A record body: JSON-serializable fields, or `Blob`/`File` for uploads. */
export type RecordBody = Record<string, unknown>;

/**
 * The wire shape of aepbase's `user` resource. Kept as an escape hatch on
 * {@link HomesteadUser.raw} so callers can read fields the library doesn't
 * model (custom claims, timestamps) without another round-trip.
 */
export interface RawUser {
  id: string;
  path?: string;
  email: string;
  display_name?: string;
  type?: string;
  create_time: string;
  update_time: string;
  [key: string]: unknown;
}

/**
 * A lean, library-owned view of the authenticated account. Consumers that need
 * a richer model (the SPA's dashboard prefs, tags) map from `raw` themselves —
 * the client intentionally does not own those product concerns.
 */
export interface HomesteadUser {
  id: string;
  email: string;
  /** aepbase's `display_name`, or `''` when unset. */
  name: string;
  /** `'superuser' | 'regular'` when the server reports a known type. */
  type?: 'superuser' | 'regular';
  created: string;
  updated: string;
  /** The untouched wire record. */
  raw: RawUser;
}

/** One page of a list response, mirroring aepbase's `results`/`next_page_token`. */
export interface Page<T> {
  records: T[];
  nextPageToken?: string;
}

/** Options common to `list`/`listAll`/`page`. */
export interface ListOptions {
  /** aepbase list filter string (see the engine's minimal filter grammar). */
  filter?: string;
  /**
   * AEP-132 `order_by`: comma-separated field names, `-field` for descending
   * (e.g. `-create_time, title`). Unset lists in id order.
   */
  orderBy?: string;
  /** Per-page size hint. The server may cap it. Defaults to 100. */
  pageSize?: number;
}

/** {@link ListOptions} plus an explicit cursor, for one-page-at-a-time reads. */
export interface PageOptions extends ListOptions {
  pageToken?: string;
}

/** Options for a create. */
export interface CreateOptions {
  /**
   * Choose the new record's id (AEP-133 `?id=`), for resources that allow it
   * (`user_settable_create`). A retried create with the same id then fails
   * with a conflict (409) instead of making a duplicate.
   */
  id?: string;
}

/** Options for a single-record delete. */
export interface DeleteOptions {
  /**
   * AEP-135 cascade delete. When true, removes the record *and* its child
   * subtree; without it, deleting a record that still has children fails 409.
   */
  force?: boolean;
}
