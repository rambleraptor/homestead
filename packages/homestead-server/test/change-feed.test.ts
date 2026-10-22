/**
 * The change feed's rules in isolation: who receives an event, what an event
 * carries, and when a reconnect can resume. Authorization is a fake here —
 * test/routes/events.test.ts runs the same feed against the real engine.
 */

import { describe, expect, test } from 'vitest';
import {
  createChangeFeed,
  principalKey,
  teeDispatcher,
  type FeedAuthorizer,
  type FeedEvent,
  type Subscriber,
} from '../src/change-feed';
import { runWithRequestContext } from '../src/engine/request-context';
import type { User } from '../src/engine/types';
import type { SyncDispatchInput } from '../src/sync';

function user(id: string, extra: Partial<User> = {}): User {
  return { id, path: `users/${id}`, email: `${id}@x`, type: 'regular', create_time: '', update_time: '', ...extra };
}

/** Readable iff the record path ends in the caller's id, or the caller is `admin`. */
const ownRecordsOnly: FeedAuthorizer = {
  canRead: (caller, _resource, path) => caller.id === 'admin' || path.endsWith(`-${caller.id}`),
};

function input(
  event: SyncDispatchInput['event'],
  path: string,
  resource = 'grocery',
): SyncDispatchInput {
  const id = path.split('/').pop()!;
  const record = { id, path, name: 'Milk', update_time: '2026-09-30T00:00:00Z' };
  return {
    event,
    resource,
    recordId: id,
    record: event === 'delete' ? null : record,
    previous: event === 'create' ? null : record,
  };
}

function listen(caller: User, resources: string[] | null = null) {
  const got: FeedEvent[] = [];
  const subscriber: Subscriber = {
    caller,
    resources: resources ? new Set(resources) : null,
    send: (e) => got.push(e),
  };
  return { got, subscriber };
}

describe('delivery', () => {
  test('an event reaches only subscribers allowed to read its record', () => {
    const feed = createChangeFeed(ownRecordsOnly);
    const alice = listen(user('alice'));
    const bob = listen(user('bob'));
    const admin = listen(user('admin'));
    feed.subscribe(alice.subscriber);
    feed.subscribe(bob.subscriber);
    feed.subscribe(admin.subscriber);

    feed.dispatch(input('create', 'groceries/g-alice'));

    expect(alice.got.map((e) => e.type)).toEqual(['resource.created']);
    expect(bob.got).toEqual([]);
    expect(admin.got).toHaveLength(1);
  });

  test('carries path, id, record, and the writer from the request context', () => {
    const feed = createChangeFeed(ownRecordsOnly);
    const alice = listen(user('alice'));
    feed.subscribe(alice.subscriber);

    runWithRequestContext({ caller: user('alice'), origin: 'tab-1' }, () =>
      feed.dispatch(input('update', 'groceries/g-alice')),
    );

    const [event] = alice.got;
    expect(event!.id).toBe(`${feed.epoch}.1`);
    expect(event!.data).toEqual({
      resource: 'grocery',
      path: 'groceries/g-alice',
      id: 'g-alice',
      actor: 'users/alice',
      origin: 'tab-1',
      update_time: '2026-09-30T00:00:00Z',
      record: { id: 'g-alice', path: 'groceries/g-alice', name: 'Milk', update_time: '2026-09-30T00:00:00Z' },
    });
  });

  test('a delete carries no record and uses the decision taken before the row went', () => {
    let rowExists = true;
    const feed = createChangeFeed({
      canRead: (caller, r, path) => rowExists && ownRecordsOnly.canRead(caller, r, path),
    });
    const alice = listen(user('alice'));
    feed.subscribe(alice.subscriber);

    feed.beforeDelete!({ resource: 'grocery', recordId: 'g-alice', path: 'groceries/g-alice' });
    rowExists = false; // committed
    feed.dispatch(input('delete', 'groceries/g-alice'));

    expect(alice.got).toHaveLength(1);
    expect(alice.got[0]!.type).toBe('resource.deleted');
    expect(alice.got[0]!.data.record).toBeUndefined();
  });

  test('?resources narrows delivery', () => {
    const feed = createChangeFeed({ canRead: () => true });
    const narrow = listen(user('alice'), ['store']);
    feed.subscribe(narrow.subscriber);

    feed.dispatch(input('create', 'groceries/g1'));
    feed.dispatch(input('create', 'stores/s1', 'store'));

    expect(narrow.got.map((e) => e.data.resource)).toEqual(['store']);
  });

  test('an authorizer that throws denies instead of failing the write', () => {
    const feed = createChangeFeed({
      canRead: () => {
        throw new Error('boom');
      },
    });
    const alice = listen(user('alice'));
    feed.subscribe(alice.subscriber);
    expect(() => feed.dispatch(input('create', 'groceries/g-alice'))).not.toThrow();
    expect(alice.got).toEqual([]);
  });

  test('a closed subscription receives nothing more', () => {
    const feed = createChangeFeed({ canRead: () => true });
    const alice = listen(user('alice'));
    const sub = feed.subscribe(alice.subscriber);
    sub.close();
    feed.dispatch(input('create', 'groceries/g1'));
    expect(alice.got).toEqual([]);
    expect(feed.size()).toBe(0);
  });
});

describe('resume', () => {
  test('replays what the principal missed, filtered by the stored decisions', () => {
    const feed = createChangeFeed(ownRecordsOnly);
    const first = listen(user('alice'));
    const sub = feed.subscribe(first.subscriber);
    feed.dispatch(input('create', 'groceries/g-alice'));
    const lastSeen = first.got[0]!.id;
    sub.close();

    feed.dispatch(input('update', 'groceries/g-alice'));
    feed.dispatch(input('create', 'groceries/g-bob'));

    const again = listen(user('alice'));
    const resumed = feed.subscribe(again.subscriber, lastSeen);
    expect(resumed.resumed).toBe(true);
    expect(resumed.replay.map((e) => [e.type, e.data.id])).toEqual([
      ['resource.updated', 'g-alice'],
    ]);
    expect(resumed.headId).toBe(`${feed.epoch}.3`);
  });

  test('refuses an id from another server run', () => {
    const feed = createChangeFeed({ canRead: () => true }, { epoch: 'new' });
    const sub = feed.subscribe(listen(user('alice')).subscriber, 'old.5');
    expect(sub.resumed).toBe(false);
    expect(sub.replay).toEqual([]);
  });

  test('refuses once the missed events have left the buffer', () => {
    const feed = createChangeFeed({ canRead: () => true }, { bufferSize: 2 });
    feed.subscribe(listen(user('alice')).subscriber).close();
    for (let i = 0; i < 5; i++) feed.dispatch(input('create', `groceries/g${i}`));
    const sub = feed.subscribe(listen(user('alice')).subscriber, `${feed.epoch}.1`);
    expect(sub.resumed).toBe(false);
  });

  test('refuses for a principal the feed was not tracking when the events happened', () => {
    const feed = createChangeFeed({ canRead: () => true });
    feed.dispatch(input('create', 'groceries/g1'));
    // Bob has never connected, so no decision about event 1 was taken for him.
    const sub = feed.subscribe(listen(user('bob')).subscriber, `${feed.epoch}.0`);
    expect(sub.resumed).toBe(false);
  });

  test('forgets an idle principal after the retention window', () => {
    let clock = 0;
    const feed = createChangeFeed({ canRead: () => true }, { now: () => clock, retentionMs: 1_000 });
    feed.subscribe(listen(user('alice')).subscriber).close();
    clock = 5_000;
    feed.dispatch(input('create', 'groceries/g1'));
    const sub = feed.subscribe(listen(user('alice')).subscriber, `${feed.epoch}.0`);
    expect(sub.resumed).toBe(false);
  });

  test('a caller that turns into a different principal is refused on re-validation', () => {
    const feed = createChangeFeed({ canRead: () => true });
    const sub = feed.subscribe(listen(user('alice')).subscriber);
    expect(sub.updateCaller(user('alice'))).toBe(true);
    expect(sub.updateCaller(user('alice', { type: 'superuser' }))).toBe(false);
  });
});

describe('principalKey', () => {
  test('separates credentials that authorize differently', () => {
    const base = user('alice');
    const keys = new Set([
      principalKey(base),
      principalKey(user('alice', { pat: { id: 'p1' } })),
      principalKey(user('alice', { oauth: { scope: 'homestead:read' } })),
      principalKey(user('alice', { type: 'superuser' })),
    ]);
    expect(keys.size).toBe(4);
    expect(principalKey(user('alice'))).toBe(principalKey(base));
  });
});

test('tee forwards dispatch and beforeDelete to every target', () => {
  const seen: string[] = [];
  const a = {
    dispatch: (i: SyncDispatchInput) => seen.push(`a:${i.event}`),
    beforeDelete: () => seen.push('a:before'),
  };
  const b = { dispatch: (i: SyncDispatchInput) => seen.push(`b:${i.event}`) };
  const tee = teeDispatcher(a, b);
  tee.beforeDelete!({ resource: 'grocery', recordId: 'g', path: 'groceries/g' });
  tee.dispatch(input('delete', 'groceries/g'));
  expect(seen).toEqual(['a:before', 'a:delete', 'b:delete']);
});
