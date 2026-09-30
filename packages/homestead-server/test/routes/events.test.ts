/**
 * `/api/events` against a real engine: events reach exactly the callers a GET
 * would serve, carry the writer's identity, survive a reconnect, and stop when
 * the token does.
 *
 * Books are locked to their authors with one filtered grant — everyone may
 * write books, but only rows where `created_by == subject.id` — so Alice and
 * Bob must see different streams, and a superuser sees everything. The filter
 * is evaluated against the row itself, which is what makes the pre-commit
 * delete decision matter.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Engine } from '../../src/engine/engine';
import { createChangeFeed, type ChangeFeed } from '../../src/change-feed';
import { makeEventsRoute, type TokenAuthenticator } from '../../src/routes/events';
import {
  call as engineCall,
  defineResource,
  makeEngine,
  seedOpenHousehold,
  seedUser,
} from '../engine/helpers';

const BOOK_DEF = {
  singular: 'book',
  plural: 'books',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: { title: { type: 'string' }, created_by: { type: 'string' } },
    required: ['title'],
  },
};

type Who = 'admin' | 'alice' | 'bob';

let engine: Engine;
let feed: ChangeFeed;
const tokens: Record<Who, string> = { admin: '', alice: '', bob: '' };
const ids: Record<Who, string> = { admin: '', alice: '', bob: '' };

function call(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return engineCall(engine, method, path, { token, body, headers });
}

interface Frame {
  id?: string;
  event?: string;
  data?: Record<string, unknown>;
}

/** Read SSE frames off a stream; `next(pred)` resolves with the first match. */
function frames(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const queued: Frame[] = [];

  const pull = async (): Promise<boolean> => {
    const { done, value } = await reader.read();
    if (done) return false;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop()!;
    for (const part of parts) {
      const frame: Frame = {};
      for (const line of part.split('\n')) {
        if (line.startsWith('id: ')) frame.id = line.slice(4);
        else if (line.startsWith('event: ')) frame.event = line.slice(7);
        else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
      }
      if (frame.event) queued.push(frame);
    }
    return true;
  };

  return {
    async next(pred: (f: Frame) => boolean = () => true): Promise<Frame> {
      for (;;) {
        const i = queued.findIndex(pred);
        if (i >= 0) return queued.splice(i, 1)[0]!;
        if (!(await pull())) throw new Error('stream ended');
      }
    },
    /** Every frame received so far that matches, without waiting. */
    received: (pred: (f: Frame) => boolean) => queued.filter(pred),
    /** Resolve true once the stream ends. */
    async ended(): Promise<boolean> {
      while (await pull());
      return true;
    },
    cancel: () => reader.cancel(),
  };
}

function route(authenticate: TokenAuthenticator = (t) => engine.authenticateToken(t), heartbeatMs = 60_000) {
  return makeEventsRoute(feed, authenticate, { heartbeatMs });
}

async function connect(
  who: Who,
  opts: { lastEventId?: string; query?: string; app?: ReturnType<typeof route> } = {},
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${tokens[who]}` };
  if (opts.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;
  const res = await (opts.app ?? route()).request(`/${opts.query ?? ''}`, { headers });
  expect(res.status).toBe(200);
  const stream = frames(res);
  const ready = await stream.next((f) => f.event === 'stream.ready');
  return { stream, ready: ready.data! };
}

beforeEach(async () => {
  const t = await makeEngine();
  engine = t.engine;
  feed = createChangeFeed(engine);
  engine.setSyncDispatcher(feed);
  await seedOpenHousehold(t);
  tokens.admin = t.adminToken;
  ids.admin = t.admin.id;
  for (const who of ['alice', 'bob'] as const) {
    const { user, token } = await seedUser(engine, { email: `${who}@example.com` });
    tokens[who] = token;
    ids[who] = user.id;
  }
  expect((await defineResource(t, BOOK_DEF, 'book')).status).toBe(200);
  expect((await defineResource(t, { ...BOOK_DEF, singular: 'film', plural: 'films' }, 'film')).status).toBe(200);

  // Close the household, then let everyone write books and films — but only
  // the rows they authored.
  expect((await call('DELETE', '/access-grants/open-household', tokens.admin)).status).toBe(204);
  for (const resource of ['book', 'film']) {
    const grant = await call('POST', `/access-grants?id=${resource}-authors`, tokens.admin, {
      subject_type: 'everyone',
      target_scope: 'collection',
      resource_type: resource,
      filter: 'created_by == subject.id',
      capability: 'write',
    });
    expect(grant.status).toBe(201);
  }
  engine.reloadPermissions();
});

afterEach(() => {
  engine.db.close();
});

/** A book authored by `who`. */
function book(who: 'alice' | 'bob', title: string) {
  return { title, created_by: ids[who] };
}

/** The sequence number in an event id. */
function seqOf(id: string | undefined): number {
  return Number(String(id).split('.').pop());
}

describe('GET /api/events', () => {
  test('rejects a missing or invalid token', async () => {
    expect((await route().request('/')).status).toBe(401);
    const res = await route().request('/', { headers: { Authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });

  test('opens with stream.ready', async () => {
    const { ready, stream } = await connect('alice');
    expect(ready).toMatchObject({ version: 1, resumed: false });
    expect(String(ready.last_event_id).startsWith(`${feed.epoch}.`)).toBe(true);
    await stream.cancel();
  });

  test('delivers a record only to callers a GET would serve, with the writer attached', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const admin = await connect('admin');
    const head = seqOf(alice.ready.last_event_id as string);

    const res = await call('POST', '/books?id=b1', tokens.alice, book('alice', 'Dune'), {
      'X-Homestead-Client': 'tab-7',
    });
    expect(res.status).toBe(201);

    const created = await alice.stream.next((f) => f.event === 'resource.created');
    expect(created.id).toBe(`${feed.epoch}.${head + 1}`);
    expect(created.data).toMatchObject({
      resource: 'book',
      path: 'books/b1',
      id: 'b1',
      actor: `users/${ids.alice}`,
      origin: 'tab-7',
      record: { id: 'b1', path: 'books/b1', title: 'Dune' },
    });
    await admin.stream.next((f) => f.event === 'resource.created');

    // Alice deletes her book: the decision is taken while the row still
    // exists, so she (its owner) still hears about it.
    expect((await call('DELETE', '/books/b1', tokens.alice)).status).toBe(204);
    const deleted = await alice.stream.next((f) => f.event === 'resource.deleted');
    expect(deleted.data).toMatchObject({ path: 'books/b1', actor: `users/${ids.alice}` });
    expect(deleted.data!.record).toBeUndefined();
    await admin.stream.next((f) => f.event === 'resource.deleted');

    // Bob can't read Alice's rows, so he heard nothing about them.
    expect(bob.stream.received(() => true)).toEqual([]);

    await Promise.all([alice.stream.cancel(), bob.stream.cancel(), admin.stream.cancel()]);
    expect(feed.size()).toBe(0);
  });

  test('canRead agrees with GET for every caller', async () => {
    await call('POST', '/books?id=b1', tokens.alice, book('alice', 'Dune'));
    const callers = {
      admin: (await engine.authenticateToken(tokens.admin))!,
      alice: (await engine.authenticateToken(tokens.alice))!,
      bob: (await engine.authenticateToken(tokens.bob))!,
    };
    const cases: Array<[string, string]> = [
      ['book', 'books/b1'],
      ['user', `users/${ids.alice}`],
      ['user', `users/${ids.bob}`],
    ];
    for (const [who, caller] of Object.entries(callers)) {
      for (const [resource, path] of cases) {
        const get = await call('GET', `/${path}`, tokens[who as Who]);
        expect([who, path, engine.canRead(caller, resource, path)]).toEqual([
          who,
          path,
          get.status === 200,
        ]);
      }
    }
  });

  test('resumes from Last-Event-ID, replaying only what the caller may read', async () => {
    const first = await connect('alice');
    await call('POST', '/books?id=b1', tokens.alice, book('alice', 'Dune'));
    const seen = await first.stream.next((f) => f.event === 'resource.created');
    await first.stream.cancel();

    // While she's away: her own edit, and a book of Bob's she can't read.
    await call('PATCH', '/books/b1', tokens.alice, { title: 'Dune Messiah' });
    await call('POST', '/books?id=b2', tokens.bob, book('bob', 'Emma'));

    const again = await connect('alice', { lastEventId: seen.id });
    const seenSeq = seqOf(seen.id);
    expect(again.ready).toMatchObject({ resumed: true, last_event_id: `${feed.epoch}.${seenSeq + 2}` });
    const replayed = await again.stream.next();
    expect(replayed).toMatchObject({
      id: `${feed.epoch}.${seenSeq + 1}`,
      event: 'resource.updated',
      data: { path: 'books/b1', record: { title: 'Dune Messiah' } },
    });
    expect(again.stream.received(() => true)).toEqual([]);
    await again.stream.cancel();
  });

  test('says so when it cannot resume', async () => {
    const { ready, stream } = await connect('alice', { lastEventId: 'another-run.4' });
    expect(ready.resumed).toBe(false);
    await stream.cancel();
  });

  test('?resources narrows the stream', async () => {
    const { stream } = await connect('alice', { query: '?resources=film' });

    await call('POST', '/books?id=b1', tokens.alice, book('alice', 'Dune'));
    await call('POST', '/films?id=f1', tokens.alice, book('alice', 'Alien'));

    const first = await stream.next();
    expect(first.data).toMatchObject({ resource: 'film', id: 'f1' });
    await stream.cancel();
  });

  test('ends the stream once the token stops validating', async () => {
    let valid = true;
    const app = route(async (t) => (valid ? engine.authenticateToken(t) : null), 10);
    const { stream } = await connect('alice', { app });
    valid = false;
    expect(await stream.ended()).toBe(true);
    expect(feed.size()).toBe(0);
  });
});
