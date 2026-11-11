/**
 * End-to-end wiring: an Engine constructed with a sync dispatcher fires it on
 * every user and dynamic-resource write with the correct event/record/previous
 * — and never leaks a user's password_hash into a snapshot.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { Engine } from '../src/engine/engine';
import { generateId, generateToken, nowRFC3339 } from '../src/engine/ids';
import { hashPassword, insertToken, insertUser } from '../src/engine/users';
import { TYPE_SUPERUSER } from '../src/engine/types';
import type { User } from '../src/engine/types';
import { createSyncDispatcher, type SyncDispatcher, type SyncDispatchInput } from '../src/sync';
import type { SyncContext } from '@rambleraptor/homestead-core/apps/types';
import type { OperationStore } from '@rambleraptor/homestead-core/resources/operations';

/** A fake dispatcher that records every dispatch call. */
function fakeDispatcher(): { dispatcher: SyncDispatcher; calls: SyncDispatchInput[] } {
  const calls: SyncDispatchInput[] = [];
  return {
    calls,
    dispatcher: {
      dispatch(input) {
        calls.push(input);
      },
    },
  };
}

async function makeEngine() {
  const filesDir = mkdtempSync(join(tmpdir(), 'hs-sync-test-'));
  const { dispatcher, calls } = fakeDispatcher();
  const engine = new Engine({
    dbPath: ':memory:',
    filesDir,
    serverUrl: 'http://localhost:8090',
    syncDispatcher: dispatcher,
  });
  // Seed a superuser to authenticate writes.
  const id = generateId();
  const now = nowRFC3339();
  const admin: User = {
    id,
    path: `users/${id}`,
    email: 'admin@example.com',
    type: TYPE_SUPERUSER,
    create_time: now,
    update_time: now,
  };
  insertUser(engine.db, admin, await hashPassword('pw'));
  const token = generateToken();
  insertToken(engine.db, token, id);
  return { engine, calls, token };
}

async function call(
  engine: Engine,
  method: string,
  path: string,
  token: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...extraHeaders };
  let payload: string | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  return engine.fetch(
    new Request(`http://localhost:8090${path}`, { method, headers, body: payload }),
  );
}

const BOOK_DEF = {
  singular: 'book',
  plural: 'books',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  },
};

afterEach(() => {});

describe('user write dispatch', () => {
  test('create dispatches {event:create, resource:user} with the record and no password_hash', async () => {
    const { engine, calls, token } = await makeEngine();

    const res = await call(engine, 'POST', '/users?id=u1', token, {
      email: 'new@example.com',
      password: 'secret-enough',
      display_name: 'New User',
    });
    expect(res.status).toBe(200);

    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.event).toBe('create');
    expect(c.resource).toBe('user');
    expect(c.recordId).toBe('u1');
    expect(c.previous).toBeNull();
    expect(c.record).toMatchObject({ id: 'u1', email: 'new@example.com', display_name: 'New User' });
    expect(c.record && 'password_hash' in c.record).toBe(false);
    engine.db.close();
  });

  test('update dispatches {event:update} with record and previous, no password_hash', async () => {
    const { engine, calls, token } = await makeEngine();
    await call(engine, 'POST', '/users?id=u1', token, { email: 'a@example.com', password: 'pw-long-enough' });
    calls.length = 0;

    const res = await call(engine, 'PATCH', '/users/u1', token, { display_name: 'Renamed' });
    expect(res.status).toBe(200);

    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.event).toBe('update');
    expect(c.resource).toBe('user');
    expect(c.recordId).toBe('u1');
    expect(c.record).toMatchObject({ id: 'u1', display_name: 'Renamed' });
    expect(c.previous).toMatchObject({ id: 'u1', email: 'a@example.com' });
    expect(c.record && 'password_hash' in c.record).toBe(false);
    expect(c.previous && 'password_hash' in c.previous).toBe(false);
    engine.db.close();
  });

  test('delete dispatches {event:delete} with record null and previous set', async () => {
    const { engine, calls, token } = await makeEngine();
    await call(engine, 'POST', '/users?id=u1', token, { email: 'a@example.com', password: 'pw-long-enough' });
    calls.length = 0;

    const res = await call(engine, 'DELETE', '/users/u1', token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({}); // 200 {} preserved

    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.event).toBe('delete');
    expect(c.resource).toBe('user');
    expect(c.recordId).toBe('u1');
    expect(c.record).toBeNull();
    expect(c.previous).toMatchObject({ id: 'u1', email: 'a@example.com' });
    expect(c.previous && 'password_hash' in c.previous).toBe(false);
    engine.db.close();
  });
});

describe('dynamic-resource write dispatch', () => {
  test('create / update / delete each dispatch with the right event and snapshots', async () => {
    const { engine, calls, token } = await makeEngine();
    const defRes = await call(engine, 'POST', '/aep-resource-definitions', token, BOOK_DEF);
    expect(defRes.ok).toBe(true);
    calls.length = 0;

    // create
    const created = await call(engine, 'POST', '/books?id=b1', token, { title: 'First' });
    expect(created.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ event: 'create', resource: 'book', recordId: 'b1', previous: null });
    expect(calls[0]!.record).toMatchObject({ id: 'b1', title: 'First' });
    calls.length = 0;

    // update
    const updated = await call(engine, 'PATCH', '/books/b1', token, { title: 'Second' });
    expect(updated.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ event: 'update', resource: 'book', recordId: 'b1' });
    expect(calls[0]!.record).toMatchObject({ id: 'b1', title: 'Second' });
    expect(calls[0]!.previous).toMatchObject({ id: 'b1', title: 'First' });
    calls.length = 0;

    // delete
    const deleted = await call(engine, 'DELETE', '/books/b1', token);
    expect(deleted.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ event: 'delete', resource: 'book', recordId: 'b1', record: null });
    expect(calls[0]!.previous).toMatchObject({ id: 'b1', title: 'Second' });
    engine.db.close();
  });

  test('no dispatcher wired → writes still succeed (identical behavior)', async () => {
    const filesDir = mkdtempSync(join(tmpdir(), 'hs-sync-none-'));
    const engine = new Engine({ dbPath: ':memory:', filesDir, serverUrl: 'http://localhost:8090' });
    const id = generateId();
    const now = nowRFC3339();
    const admin: User = {
      id,
      path: `users/${id}`,
      email: 'admin@example.com',
      type: TYPE_SUPERUSER,
      create_time: now,
      update_time: now,
    };
    insertUser(engine.db, admin, await hashPassword('pw'));
    const token = generateToken();
    insertToken(engine.db, token, id);

    const res = await call(engine, 'POST', '/users?id=u9', token, { email: 'x@example.com', password: 'pw-long-enough' });
    expect(res.status).toBe(200);
    engine.db.close();
  });
});

describe('writer and origin reach the syncs', () => {
  const noOperations: OperationStore = {
    async create() {
      return { id: 'op', path: 'operations/op', done: false } as Awaited<
        ReturnType<OperationStore['create']>
      >;
    },
    async complete() {},
    async updateMetadata() {},
  };

  test("a sync sees who wrote the change and their X-Homestead-Client tag, and skips its own", async () => {
    const { engine, token } = await makeEngine();
    const defRes = await call(engine, 'POST', '/aep-resource-definitions', token, BOOK_DEF);
    expect(defRes.ok).toBe(true);

    const seen: SyncContext[] = [];
    const dispatcher = createSyncDispatcher(
      engine.db,
      [
        {
          id: 'book-mirror',
          appId: 'test-app',
          resource: 'book',
          load: async () => ({ default: async (ctx: SyncContext) => void seen.push(ctx) }),
        },
      ],
      noOperations,
    );
    engine.setSyncDispatcher(dispatcher);
    const admin = (await engine.authenticateToken(token))!;

    await call(engine, 'POST', '/books?id=b1', token, { title: 'Imported' }, {
      'X-Homestead-Client': 'cron:book-import',
    });
    // The sync writing back to the record it mirrors doesn't fire it again.
    await call(engine, 'PATCH', '/books/b1', token, { title: 'Stamped' }, {
      'X-Homestead-Client': 'sync:book-mirror',
    });
    // A malformed tag is dropped, not passed on.
    await call(engine, 'PATCH', '/books/b1', token, { title: 'Edited' }, {
      'X-Homestead-Client': 'not a tag!',
    });
    await dispatcher.idle();

    expect(seen.map((c) => [c.event, c.record?.title, c.actor, c.origin])).toEqual([
      ['create', 'Imported', `users/${admin.id}`, 'cron:book-import'],
      ['update', 'Edited', `users/${admin.id}`, null],
    ]);
    dispatcher.stop();
    engine.db.close();
  });

  test('user writes carry the writer too', async () => {
    const { engine, token } = await makeEngine();
    const calls: Array<{ actor: string | null; origin: string | null }> = [];
    const dispatcher = createSyncDispatcher(
      engine.db,
      [
        {
          id: 'user-mirror',
          appId: 'test-app',
          resource: 'user',
          when: ({ actor, origin }) => {
            calls.push({ actor, origin });
            return false;
          },
          load: async () => ({ default: async () => {} }),
        },
      ],
      noOperations,
    );
    engine.setSyncDispatcher(dispatcher);
    const admin = (await engine.authenticateToken(token))!;

    await call(engine, 'POST', '/users?id=u1', token, { email: 'a@example.com', password: 'pw-long-enough' }, {
      'X-Homestead-Client': 'tab-1',
    });
    await call(engine, 'PATCH', '/users/u1', token, { display_name: 'A' });

    expect(calls).toEqual([
      { actor: `users/${admin.id}`, origin: 'tab-1' },
      { actor: `users/${admin.id}`, origin: null },
    ]);
    dispatcher.stop();
    engine.db.close();
  });
});
