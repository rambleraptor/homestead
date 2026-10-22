/**
 * In-process change feed behind `GET /api/events` (see routes/events.ts for
 * the wire format, and docs/guides/events.md for the public contract).
 *
 * The feed rides the engine's post-commit write seam: {@link teeDispatcher}
 * fans each `dispatch` out to the resource-sync dispatcher and to this feed.
 * Publishing is synchronous and never throws, so a subscriber can't block or
 * fail the write that produced the event.
 *
 * **Who sees what.** Every event carries the changed record, so each one is
 * delivered only to subscribers allowed to read that record — decided by the
 * engine's own read authorization (`engine.canRead`, the check a GET runs),
 * evaluated per *principal* (a user acting through a given kind of credential)
 * when the event is published. For a delete the decision is taken in
 * `beforeDelete`, while the row still exists; afterwards there is nothing left
 * to authorize against.
 *
 * **Resume.** Events get a sequence number, `<epoch>.<seq>`, and the last
 * {@link DEFAULT_BUFFER_SIZE} (up to {@link DEFAULT_RETENTION_MS} old) are
 * kept. A reconnecting client sends the last id it saw and gets what it missed
 * replayed, filtered by the same stored decisions. Replay is refused — and the
 * client told to refetch — when the id is from another server run (the epoch
 * changed), older than the buffer, or older than the feed's knowledge of the
 * principal: a decision the feed never took can't be replayed. Principals are
 * remembered for the retention window after their last connection closes, so
 * an ordinary reconnect is always resumable.
 */

import { randomBytes } from 'node:crypto';
import { currentRequestContext } from './engine/request-context';
import type { User } from './engine/types';
import type { PreDeleteInput, SyncDispatcher, SyncDispatchInput } from './sync';

export const DEFAULT_BUFFER_SIZE = 1_000;
export const DEFAULT_RETENTION_MS = 10 * 60 * 1000;
/** How long a pre-delete decision waits for its delete to commit. */
const PENDING_DELETE_TTL_MS = 60_000;

export type ResourceEventType = 'resource.created' | 'resource.updated' | 'resource.deleted';

/** The `data` payload of a `resource.*` event — the public wire shape. */
export interface ResourceEventData {
  /** Resource singular, e.g. `grocery`. */
  resource: string;
  /** AEP resource path, e.g. `groceries/abc` or `credit-cards/1/perks/2`. */
  path: string;
  id: string;
  /** `users/<id>` of the writer; null for writes with no authenticated caller. */
  actor: string | null;
  /** The writer's `X-Homestead-Client` tag, echoed so it can skip its own events. */
  origin: string | null;
  update_time: string;
  /** The record after the change, as a GET returns it. Absent on delete. */
  record?: Record<string, unknown>;
}

export interface FeedEvent {
  seq: number;
  /** SSE event id: `<epoch>.<seq>`. */
  id: string;
  type: ResourceEventType;
  data: ResourceEventData;
  /** Principal keys allowed to receive this event. */
  audience: ReadonlySet<string>;
  at: number;
}

export interface FeedAuthorizer {
  canRead(caller: User, resource: string, path: string): boolean;
}

export interface Subscriber {
  caller: User;
  /** Resource singulars to receive; null for all the caller may read. */
  resources: ReadonlySet<string> | null;
  send(event: FeedEvent): void;
}

export interface Subscription {
  /** Whether the requested `lastEventId` could be honored. */
  resumed: boolean;
  /** Missed events to send before live ones (empty unless resumed). */
  replay: FeedEvent[];
  /** Id of the newest event the feed has published. */
  headId: string;
  /** Swap in a freshly re-validated caller. False if it's now a different principal. */
  updateCaller(caller: User): boolean;
  close(): void;
}

export interface ChangeFeed extends SyncDispatcher {
  readonly epoch: string;
  subscribe(subscriber: Subscriber, lastEventId?: string | null): Subscription;
  /** Live subscriptions (tests / diagnostics). */
  size(): number;
}

export interface ChangeFeedOptions {
  bufferSize?: number;
  retentionMs?: number;
  now?: () => number;
  epoch?: string;
}

/**
 * Identity for authorization purposes: the user, their type, and whatever the
 * credential narrows (a PAT's own grants, an OAuth scope). Two connections
 * with the same key always get the same answer from `canRead`.
 */
export function principalKey(caller: User): string {
  const scope = caller.oauth ? `oauth:${caller.oauth.scope ?? '*'}` : '';
  const pat = caller.pat ? `pat:${caller.pat.id}` : '';
  return [caller.id, caller.type, pat, scope].join('|');
}

interface Principal {
  caller: User;
  /** First seq whose audience decision included this principal. */
  knownSince: number;
  connections: number;
  lastSeen: number;
}

const EVENT_TYPES: Record<SyncDispatchInput['event'], ResourceEventType> = {
  create: 'resource.created',
  update: 'resource.updated',
  delete: 'resource.deleted',
};

export function createChangeFeed(
  authz: FeedAuthorizer,
  opts: ChangeFeedOptions = {},
): ChangeFeed {
  const bufferSize = opts.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const retentionMs = opts.retentionMs ?? DEFAULT_RETENTION_MS;
  const now = opts.now ?? Date.now;
  const epoch = opts.epoch ?? randomBytes(6).toString('hex');

  let headSeq = 0;
  const buffer: FeedEvent[] = [];
  const principals = new Map<string, Principal>();
  const subscribers = new Map<Subscriber, string>();
  const pendingDeletes = new Map<string, { audience: Set<string>; at: number }>();

  const eventId = (seq: number) => `${epoch}.${seq}`;

  const prune = () => {
    const cutoff = now() - retentionMs;
    for (const [key, p] of principals) {
      if (p.connections === 0 && p.lastSeen < cutoff) principals.delete(key);
    }
    while (buffer.length > bufferSize || (buffer.length > 0 && buffer[0]!.at < cutoff)) {
      buffer.shift();
    }
    const pendingCutoff = now() - PENDING_DELETE_TTL_MS;
    for (const [key, pending] of pendingDeletes) {
      if (pending.at < pendingCutoff) pendingDeletes.delete(key);
    }
  };

  const audienceFor = (resource: string, path: string): Set<string> => {
    const allowed = new Set<string>();
    for (const [key, p] of principals) {
      try {
        if (authz.canRead(p.caller, resource, path)) allowed.add(key);
      } catch {
        // An authorization error is a "no", never a failed write.
      }
    }
    return allowed;
  };

  const matches = (sub: Subscriber, key: string, event: FeedEvent) =>
    event.audience.has(key) && (!sub.resources || sub.resources.has(event.data.resource));

  return {
    epoch,

    beforeDelete(input: PreDeleteInput) {
      try {
        pendingDeletes.set(`${input.resource} ${input.path}`, {
          audience: audienceFor(input.resource, input.path),
          at: now(),
        });
      } catch {
        // Never fail the delete; the post-commit dispatch falls back.
      }
    },

    dispatch(input) {
      try {
        prune();
        const state = input.record ?? input.previous;
        const path = typeof state?.path === 'string' ? state.path : '';
        if (!path) return;

        let audience: Set<string>;
        if (input.event === 'delete') {
          const key = `${input.resource} ${path}`;
          audience = pendingDeletes.get(key)?.audience ?? audienceFor(input.resource, path);
          pendingDeletes.delete(key);
        } else {
          audience = audienceFor(input.resource, path);
        }

        const ctx = currentRequestContext();
        const seq = ++headSeq;
        const data: ResourceEventData = {
          resource: input.resource,
          path,
          id: input.recordId,
          actor: ctx?.caller ? `users/${ctx.caller.id}` : null,
          origin: ctx?.origin ?? null,
          update_time:
            typeof input.record?.update_time === 'string'
              ? input.record.update_time
              : new Date(now()).toISOString(),
        };
        if (input.record) data.record = input.record;

        const event: FeedEvent = {
          seq,
          id: eventId(seq),
          type: EVENT_TYPES[input.event],
          data,
          audience,
          at: now(),
        };
        buffer.push(event);
        if (buffer.length > bufferSize) buffer.shift();

        for (const [sub, key] of subscribers) {
          if (!matches(sub, key, event)) continue;
          try {
            sub.send(event);
          } catch {
            // A subscriber's failure is its own; the write already committed.
          }
        }
      } catch {
        // Publishing must never fail the write that triggered it.
      }
    },

    subscribe(subscriber, lastEventId) {
      prune();
      let key = principalKey(subscriber.caller);
      let principal = principals.get(key);
      if (!principal) {
        principal = { caller: subscriber.caller, knownSince: headSeq + 1, connections: 0, lastSeen: now() };
        principals.set(key, principal);
      }
      principal.caller = subscriber.caller;
      principal.connections += 1;
      subscribers.set(subscriber, key);

      let resumed = false;
      let replay: FeedEvent[] = [];
      const from = parseEventId(lastEventId, epoch);
      if (from !== null && from <= headSeq) {
        const oldest = buffer[0]?.seq ?? headSeq + 1;
        const bufferCovers = from + 1 >= oldest;
        const decided = from + 1 >= principal.knownSince;
        if (bufferCovers && decided) {
          resumed = true;
          replay = buffer.filter((e) => e.seq > from && matches(subscriber, key, e));
        }
      }

      let closed = false;
      return {
        resumed,
        replay,
        headId: eventId(headSeq),
        updateCaller(caller) {
          if (principalKey(caller) !== key) return false;
          subscriber.caller = caller;
          const p = principals.get(key);
          if (p) p.caller = caller;
          return true;
        },
        close() {
          if (closed) return;
          closed = true;
          subscribers.delete(subscriber);
          const p = principals.get(key);
          if (p) {
            p.connections -= 1;
            p.lastSeen = now();
          }
          key = '';
        },
      };
    },

    size: () => subscribers.size,
  };
}

/** Parse `<epoch>.<seq>`; null unless it's from this epoch and well-formed. */
function parseEventId(id: string | null | undefined, epoch: string): number | null {
  if (!id) return null;
  const dot = id.lastIndexOf('.');
  if (dot < 0 || id.slice(0, dot) !== epoch) return null;
  const seq = Number(id.slice(dot + 1));
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
}

/** Fan one post-commit dispatch out to several dispatchers. */
export function teeDispatcher(...targets: SyncDispatcher[]): SyncDispatcher {
  return {
    dispatch(input) {
      for (const target of targets) target.dispatch(input);
    },
    beforeDelete(input) {
      for (const target of targets) target.beforeDelete?.(input);
    },
  };
}
