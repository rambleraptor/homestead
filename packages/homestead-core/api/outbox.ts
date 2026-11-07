/**
 * The outbox: writes waiting to reach the server, kept as the AEP requests
 * they will be sent as.
 *
 * Each entry is one AEP standard method on one resource, addressed by its
 * AEP-122 resource name (`credit-cards/c1/perks/p1`, the same `path` every
 * record carries):
 *
 * - **create** (AEP-133) — `POST {parent}/{collection}?id={id}`. The client
 *   chooses the id, so the record has its final name before the server has
 *   seen it, and sending the create twice is answered with a 409 — the record
 *   from the first attempt is adopted.
 * - **update** (AEP-134) — `PATCH {name}` with an RFC 7396 JSON Merge Patch.
 *   Sending it twice changes nothing more.
 * - **delete** (AEP-135) — `DELETE {name}?force=true`. A 404 means it's
 *   already gone, which is what was asked for.
 *
 * Because every request is a standard method, the outbox can reason about a
 * write without knowing which app made it: entries replay in order, any
 * client can send them, and queued writes to one name collapse — a create
 * then an update is one create, two updates are one patch, a create then a
 * delete never needs to leave the device.
 *
 * The queue is saved to the device (IndexedDB; `offlineStore.ts`) after every
 * change, so it survives reloads and app updates. An entry whose body carries
 * a secret field (`redactSecrets.ts`) is kept in memory only: it syncs while
 * the app is open, but its value never touches the disk.
 */

import { onlineManager } from '@tanstack/react-query';
import { aepbase, AepbaseError, type ParentPath } from './aepbase';
import { isNetworkError, reportNetworkFailure } from './connectivity';
import { deviceStore, type KeyValueStore } from './offlineStore';
import {
  containsSecretValue,
  installedSecretFields,
  type SecretFieldIndex,
} from './redactSecrets';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// AEP-122 resource names
// ---------------------------------------------------------------------------

/** A resource name taken apart: parent segments, collection, id. */
export interface ParsedResourceName {
  /** Alternating `[collection, id, …]` of the ancestors; empty at top level. */
  parent: ParentPath;
  collection: string;
  id: string;
}

/** The name of `id` in `collection`, under `parent` (itself a resource name). */
export function resourceName(collection: string, id: string, parent?: string): string {
  return parent ? `${parent}/${collection}/${id}` : `${collection}/${id}`;
}

export function parseResourceName(name: string): ParsedResourceName {
  const segments = name.split('/');
  if (segments.length < 2 || segments.length % 2 !== 0 || segments.some((s) => s === '')) {
    throw new Error(`"${name}" is not a resource name`);
  }
  return {
    parent: segments.slice(0, -2),
    collection: segments[segments.length - 2]!,
    id: segments[segments.length - 1]!,
  };
}

/** Whether `name` is `ancestor` or sits anywhere beneath it. */
function isWithin(name: string, ancestor: string): boolean {
  return name === ancestor || name.startsWith(`${ancestor}/`);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type OutboxMethod = 'create' | 'update' | 'delete';

/** One AEP standard-method call, as stored. */
export interface OutboxRequest {
  /** Unique per request; how a caller follows its own write. */
  request_id: string;
  method: OutboxMethod;
  /** AEP-122 name of the resource the method acts on (for create: the one it makes). */
  name: string;
  /** create: the resource; update: a JSON Merge Patch. */
  body?: Record<string, unknown>;
  /** When the person made the change (RFC 3339). */
  enqueue_time: string;
  /**
   * update: the version (`update_time`) the change was made against, sent as
   * `If-Match` so the server refuses it (412) if the record has changed since.
   * Kept current as this device's own earlier writes to the record land.
   */
  if_match?: string;
}

/** Sends one request to the server. The default goes through the aepbase client. */
export interface OutboxTransport {
  send(request: OutboxRequest): Promise<Record<string, unknown> | undefined>;
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof AepbaseError && error.code === status;
}

export const aepTransport: OutboxTransport = {
  async send({ method, name, body = {}, if_match }) {
    const { parent, collection, id } = parseResourceName(name);
    const at = parent.length > 0 ? { parent } : {};
    switch (method) {
      case 'create':
        try {
          return await aepbase.create(collection, body, { ...at, id });
        } catch (error) {
          // 409 on the id we chose: an earlier attempt of this create landed
          // but its response was lost. That record is ours — adopt it.
          if (!isHttpStatus(error, 409)) throw error;
          return await aepbase.get(collection, id, at);
        }
      case 'update': {
        const conditional = if_match ? { ifMatch: if_match } : {};
        if (parent.length > 0) return await aepbase.update(collection, id, body, { parent, ...conditional });
        return if_match
          ? await aepbase.update(collection, id, body, conditional)
          : await aepbase.update(collection, id, body);
      }
      case 'delete':
        try {
          // force: deleting in the UI means the whole subtree (the apps'
          // confirm dialogs say so); ignored when there are no children.
          await aepbase.remove(collection, id, { ...at, force: true });
        } catch (error) {
          // Already gone — by someone else, or by an earlier attempt whose
          // response was lost. The person's intent holds.
          if (!isHttpStatus(error, 404)) throw error;
        }
        return undefined;
    }
  },
};

// ---------------------------------------------------------------------------
// JSON Merge Patch (RFC 7396)
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `target` with `patch` applied (RFC 7396): null removes, objects merge. */
export function applyMergePatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (isPlainObject(value)) {
      out[key] = applyMergePatch(isPlainObject(out[key]) ? out[key] : {}, value);
    } else out[key] = value;
  }
  return out;
}

/**
 * One patch with the effect of `first` then `second`, or null when no single
 * merge patch can say that: `first` removing a key that `second` then sets to
 * an object would merge that object into whatever the server still holds.
 */
export function composeMergePatches(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { ...first };
  for (const [key, value] of Object.entries(second)) {
    const earlier = out[key];
    if (isPlainObject(value) && isPlainObject(earlier)) {
      const nested = composeMergePatches(earlier, value);
      if (nested === null) return null;
      out[key] = nested;
    } else if (isPlainObject(value) && earlier === null) {
      return null;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading through the outbox
// ---------------------------------------------------------------------------

type Row = { id: string } & Record<string, unknown>;

/**
 * `records` — one collection as read from the server or the cache — with the
 * queued requests for that collection applied, so a read shows what the
 * person has done even before the server has it. `collection` is the list's
 * own name: `groceries`, or `credit-cards/c1/perks` for one parent's children.
 *
 * The AEP methods say exactly what each request does to a read: a create adds
 * the record (unless the read already has it), an update applies its merge
 * patch, a delete removes it. Requests for other collections, or beneath
 * these records, are left alone.
 */
export function applyPendingWrites<T extends Row>(
  records: readonly T[],
  collection: string,
  requests: readonly OutboxRequest[],
  /** Shapes a created record like the rest of the list (a list hook's `map`). */
  created: (raw: Row) => T = (raw) => raw as T,
): T[] {
  let out = [...records];
  for (const request of requests) {
    const at = request.name.lastIndexOf('/');
    if (request.name.slice(0, at) !== collection) continue;
    const id = request.name.slice(at + 1);
    const index = out.findIndex((r) => r.id === id);
    if (request.method === 'delete') {
      if (index !== -1) out = out.filter((r) => r.id !== id);
    } else if (request.method === 'update') {
      if (index !== -1) out[index] = applyMergePatch(out[index]!, request.body ?? {}) as T;
    } else if (index === -1) {
      out.push(
        created({
          ...(request.body ?? {}),
          id,
          path: request.name,
          create_time: request.enqueue_time,
          update_time: request.enqueue_time,
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The outbox
// ---------------------------------------------------------------------------

/** What became of a request once the server answered it. */
export type OutboxResult =
  | { request: OutboxRequest; ok: true; record?: Record<string, unknown>; awaited: boolean }
  | { request: OutboxRequest; ok: false; error: unknown; awaited: boolean };

/** A caller's handle on the write it queued. */
export interface OutboxTicket {
  request_id: string;
  /**
   * Settles when the server answers: resolves with the record it returned
   * (none for a delete, or a write that never needed sending), rejects with
   * the server's error. Stays pending while the write is queued.
   */
  done: Promise<Record<string, unknown> | undefined>;
  /** Resolves once the write is waiting for a connection rather than being sent. */
  parked: Promise<void>;
}

interface Waiter {
  resolve: (record: Record<string, unknown> | undefined) => void;
  reject: (error: unknown) => void;
  park: () => void;
  /** Once parked, the caller has moved on: it took the write as saved locally. */
  isParked: () => boolean;
}

export interface OutboxOptions {
  /** Where the queue is saved; the device store by default, null for memory only. */
  store?: KeyValueStore | null;
  transport?: OutboxTransport;
  secretFields?: () => SecretFieldIndex;
  /** Whether to try sending now; React Query's online state by default. */
  isOnline?: () => boolean;
}

export const OUTBOX_STORAGE_KEY = 'homestead:outbox:v1';

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class Outbox {
  private queue: OutboxRequest[] = [];
  private inFlight: string | null = null;
  private draining = false;
  private parkedState = false;
  private loaded: Promise<void> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private readonly waiters = new Map<string, Waiter[]>();
  private readonly changeListeners = new Set<() => void>();
  private readonly resultListeners = new Set<(result: OutboxResult) => void>();
  private readonly store: KeyValueStore | null;
  private readonly transport: OutboxTransport;
  private readonly secretFields: () => SecretFieldIndex;
  private readonly isOnline: () => boolean;

  constructor(options: OutboxOptions = {}) {
    this.store = options.store === undefined ? deviceStore : options.store;
    this.transport = options.transport ?? aepTransport;
    this.secretFields = options.secretFields ?? installedSecretFields;
    this.isOnline = options.isOnline ?? (() => onlineManager.isOnline());
  }

  // ---- reading ------------------------------------------------------------

  /** Every queued request, oldest first (including one being sent). */
  requests(): readonly OutboxRequest[] {
    return this.queue;
  }

  /**
   * Whether the queue is waiting for a connection: offline, or the last send
   * never reached the server. While it's draining online, it isn't — a write
   * that's on its way shouldn't flash a "waiting to sync" badge.
   */
  isParked(): boolean {
    return this.queue.length > 0 && this.parkedState;
  }

  /** Whether anything queued acts on a resource in one of these collections. */
  hasPendingIn(collections: ReadonlySet<string>): boolean {
    return this.queue.some((r) => collections.has(parseResourceName(r.name).collection));
  }

  /** Call `listener` whenever the queue or its parked state changes. */
  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Call `listener` with each request's outcome. */
  onResult(listener: (result: OutboxResult) => void): () => void {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  // ---- writing ------------------------------------------------------------

  /**
   * Queue a request and start sending if online. A write to a name that
   * already has a queued (not yet sent) write is folded into it where the
   * methods allow — see the class comment.
   */
  enqueue(
    method: OutboxMethod,
    name: string,
    body?: Record<string, unknown>,
    options: { ifMatch?: string } = {},
  ): OutboxTicket {
    parseResourceName(name); // reject a malformed name now, not at replay
    const request: OutboxRequest = {
      request_id: newRequestId(),
      method,
      name,
      ...(body !== undefined ? { body } : {}),
      enqueue_time: new Date().toISOString(),
      ...(method === 'update' && options.ifMatch ? { if_match: options.ifMatch } : {}),
    };
    const ticket = this.ticketFor(request.request_id);
    const followed = this.fold(request);
    this.follow(followed, request.request_id);
    this.changed();
    void this.drain();
    return ticket;
  }

  /** Load the queue saved on the device. Safe to call more than once. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      if (!this.store) return;
      try {
        const raw = await this.store.get(OUTBOX_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as OutboxRequest[];
        const known = new Set(this.queue.map((r) => r.request_id));
        // Saved requests are older than anything queued since the page loaded.
        this.queue = [...saved.filter((r) => !known.has(r.request_id)), ...this.queue];
        this.changed();
      } catch (err) {
        logger.warn('Could not read the queued writes saved on this device', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      void this.drain();
    })();
    return this.loaded;
  }

  /** Forget every queued write (a different person is signing in). */
  async clear(): Promise<void> {
    const dropped = this.queue.filter((r) => r.request_id !== this.inFlight);
    this.queue = this.queue.filter((r) => r.request_id === this.inFlight);
    for (const r of dropped) this.settle(r, { ok: true });
    this.changed();
    await this.saving;
    await this.store?.delete(OUTBOX_STORAGE_KEY);
  }

  /** Send everything queued, oldest first, until it's empty or the connection fails. */
  async drain(): Promise<void> {
    if (this.draining) return;
    if (!this.isOnline()) {
      this.parkAll();
      return;
    }
    this.draining = true;
    this.setParked(false);
    try {
      while (this.queue.length > 0) {
        if (!this.isOnline()) {
          this.parkAll();
          return;
        }
        const request = this.queue[0]!;
        this.inFlight = request.request_id;
        let result: { ok: true; record?: Record<string, unknown> } | { ok: false; error: unknown };
        try {
          result = { ok: true, record: await this.transport.send(request) };
        } catch (error) {
          if (isNetworkError(error)) {
            // Never reached the server: keep it, and wait for the way back.
            this.inFlight = null;
            reportNetworkFailure();
            this.parkAll();
            return;
          }
          result = { ok: false, error };
        }
        this.inFlight = null;
        this.queue.shift();
        if (!result.ok && request.method === 'create') {
          // Nothing under a name that was never created can succeed.
          this.dropWithin(request.name, result.error);
        }
        if (result.ok) this.rebase(request.name, result.record);
        if (!result.ok && request.method === 'update' && isHttpStatus(result.error, 412)) {
          this.absorbRefusedEdits(request);
        }
        // Report the outcome before announcing the shorter queue, so a
        // listener that acts on "queue empty" has already seen this result.
        this.settle(request, result);
        this.changed();
      }
    } finally {
      this.inFlight = null;
      this.draining = false;
    }
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Fold `request` into a queued write to the same name when the two methods
   * combine, else append it. Returns the request id whose outcome answers
   * this one.
   */
  private fold(request: OutboxRequest): string {
    const { name, method } = request;
    const pending = this.queue.filter((r) => r.name === name && r.request_id !== this.inFlight);
    const last = pending[pending.length - 1];

    if (method === 'update' && last && last.method !== 'delete' && request.body) {
      if (last.method === 'create') {
        last.body = applyMergePatch(last.body ?? {}, request.body);
        return last.request_id;
      }
      const composed = composeMergePatches(last.body ?? {}, request.body);
      if (composed) {
        last.body = composed;
        return last.request_id;
      }
    }

    if (method === 'delete') {
      const create = pending.find((r) => r.method === 'create');
      if (create) {
        // The server never saw it: drop it, and everything queued beneath it.
        this.dropWithin(name, undefined);
        this.settleNow(request.request_id);
        return request.request_id;
      }
      // Updates to a record about to be deleted would only be overwritten.
      for (const r of pending) this.remove(r.request_id, { ok: true });
    }

    this.queue.push(request);
    return request.request_id;
  }

  /**
   * This device's own write to `name` landed: later queued edits to it were
   * made on top of that write, so they're now against the version the server
   * just returned — not the one they were queued with.
   */
  private rebase(name: string, record: Record<string, unknown> | undefined): void {
    const version = record?.update_time;
    if (typeof version !== 'string') return;
    for (const r of this.queue) {
      if (r.name === name && r.method === 'update' && r.if_match) r.if_match = version;
    }
  }

  /**
   * An edit was refused because the record changed elsewhere (412). Every
   * later queued edit to it was made on top of the refused one, so they're
   * refused with it: folded into its body, and their callers answered with its
   * outcome, so the refusal is reported once, carrying the person's whole
   * change.
   */
  private absorbRefusedEdits(refused: OutboxRequest): void {
    const later = this.queue.filter(
      (q) => q.name === refused.name && q.method === 'update' && q.request_id !== this.inFlight,
    );
    for (const r of later) {
      refused.body = applyMergePatch(refused.body ?? {}, r.body ?? {});
      this.follow(refused.request_id, r.request_id);
    }
    const absorbed = new Set(later.map((r) => r.request_id));
    this.queue = this.queue.filter((q) => !absorbed.has(q.request_id));
  }

  /** Remove every queued request on `name` or beneath it (not one in flight). */
  private dropWithin(name: string, error: unknown): void {
    for (const r of this.queue.filter((q) => isWithin(q.name, name) && q.request_id !== this.inFlight)) {
      this.remove(r.request_id, error === undefined ? { ok: true } : { ok: false, error });
    }
  }

  private remove(
    requestId: string,
    outcome: { ok: true; record?: Record<string, unknown> } | { ok: false; error: unknown },
  ): void {
    const request = this.queue.find((r) => r.request_id === requestId);
    this.queue = this.queue.filter((r) => r.request_id !== requestId);
    if (request) this.settle(request, outcome);
  }

  private ticketFor(requestId: string): OutboxTicket {
    let waiter!: Waiter;
    let resolvePark!: () => void;
    let isParked = false;
    const parked = new Promise<void>((resolve) => (resolvePark = resolve));
    const park = () => {
      isParked = true;
      resolvePark();
    };
    const done = new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      waiter = { resolve, reject, park, isParked: () => isParked };
    });
    // A caller that only watches `parked` shouldn't trip unhandled rejections.
    done.catch(() => {});
    this.waiters.set(requestId, [waiter]);
    return { request_id: requestId, done, parked };
  }

  /** Make `requestId`'s waiters wait on `target`'s outcome instead. */
  private follow(target: string, requestId: string): void {
    if (target === requestId) return;
    const own = this.waiters.get(requestId) ?? [];
    this.waiters.delete(requestId);
    this.waiters.set(target, [...(this.waiters.get(target) ?? []), ...own]);
    if (this.parkedState) own.forEach((w) => w.park());
  }

  private settleNow(requestId: string): void {
    for (const w of this.waiters.get(requestId) ?? []) w.resolve(undefined);
    this.waiters.delete(requestId);
  }

  /**
   * Answer a request's waiters and tell result listeners. `awaited` says
   * whether a caller was still waiting on it: if so, that caller reports the
   * outcome (a form shows its own error); if not, nobody is watching and the
   * listeners must (a write made offline that the server later refuses).
   */
  private settle(
    request: OutboxRequest,
    outcome: { ok: true; record?: Record<string, unknown> } | { ok: false; error: unknown },
  ): void {
    const waiters = this.waiters.get(request.request_id) ?? [];
    this.waiters.delete(request.request_id);
    const awaited = waiters.some((w) => !w.isParked());
    for (const w of waiters) {
      if (outcome.ok) w.resolve(outcome.record);
      else w.reject(outcome.error);
    }
    const result: OutboxResult = outcome.ok
      ? { request, ok: true, record: outcome.record, awaited }
      : { request, ok: false, error: outcome.error, awaited };
    for (const l of this.resultListeners) l(result);
  }

  private parkAll(): void {
    this.setParked(true);
    for (const waiters of this.waiters.values()) waiters.forEach((w) => w.park());
  }

  private setParked(parked: boolean): void {
    if (this.parkedState === parked) return;
    this.parkedState = parked;
    for (const l of this.changeListeners) l();
  }

  private changed(): void {
    this.save();
    for (const l of this.changeListeners) l();
  }

  /** Save the queue, minus anything carrying a secret. Writes run in order. */
  private save(): void {
    if (!this.store) return;
    const store = this.store;
    const secrets = this.secretFields();
    const snapshot = JSON.stringify(this.queue.filter((r) => !containsSecretValue(r.body, secrets)));
    this.saving = this.saving
      .then(() => (this.queue.length === 0 ? store.delete(OUTBOX_STORAGE_KEY) : store.set(OUTBOX_STORAGE_KEY, snapshot)))
      .catch((err) => {
        logger.warn('Could not save the queued writes on this device', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }
}

// ---------------------------------------------------------------------------
// The page's outbox
// ---------------------------------------------------------------------------

/** The outbox this page sends its writes through. */
export const outbox = new Outbox();

let started = false;

/**
 * Load the saved queue and keep it draining: whenever React Query's online
 * state comes back (the browser's events, or the connectivity probe seeing
 * the server again), send what's waiting. Idempotent.
 */
export function startOutbox(): Promise<void> {
  if (!started) {
    started = true;
    onlineManager.subscribe((online) => {
      if (online) void outbox.drain();
    });
  }
  return outbox.load();
}
