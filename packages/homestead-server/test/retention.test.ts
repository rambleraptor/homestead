/**
 * The retention sweep (`core/resources/retention.ts`) against a real engine:
 * which rows go, which stay, and that a delete still behaves like a delete —
 * children cascade, a `restrict` reference keeps its target, the cap holds.
 * Row timestamps are rewritten in the table so nothing depends on the clock.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { bearerToken, createHomesteadClient } from '@rambleraptor/homestead-client';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { sweepRetention } from '@rambleraptor/homestead-core/resources/retention';
import { operationsResources } from '@rambleraptor/homestead-core/operations/resources';
import { notificationsResources } from '@rambleraptor/homestead-core/notifications/resources';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './engine/helpers';

const FIRED_AT = '2026-10-24T03:00:00Z';
const OLD = '2026-08-01T00:00:00Z'; // ~84 days before FIRED_AT
const FRESH = '2026-10-20T00:00:00Z'; // 4 days before

/** Expires 30 days after its last write. */
const MEMO: ResourceDefinition = {
  singular: 'memo',
  plural: 'memos',
  user_settable_create: true,
  retention: { days: 30 },
  fields: { title: { type: 'string' } },
};
const MEMO_NOTE: ResourceDefinition = {
  singular: 'memo-note',
  plural: 'memo-notes',
  parents: ['memo'],
  user_settable_create: true,
  fields: { text: { type: 'string' } },
};
/** Holds a restrict reference: a pinned memo can't be deleted. */
const PIN: ResourceDefinition = {
  singular: 'pin',
  plural: 'pins',
  user_settable_create: true,
  fields: { memo: { type: 'string', reference: { resource: 'memo', onDelete: 'restrict' } } },
};
/** Expires 60 days after its own last-activity field. */
const THREAD: ResourceDefinition = {
  singular: 'thread',
  plural: 'threads',
  user_settable_create: true,
  retention: { days: 60, field: 'last_at' },
  fields: { last_at: { type: 'string', format: 'date-time' } },
};
/** No retention: never touched. */
const KEEPER: ResourceDefinition = {
  singular: 'keeper',
  plural: 'keepers',
  user_settable_create: true,
  fields: { title: { type: 'string' } },
};
const DEFS = [MEMO, MEMO_NOTE, PIN, THREAD, KEEPER];

let t: TestEngine;

function client() {
  return createHomesteadClient({
    baseUrl: 'http://localhost:8090',
    auth: bearerToken(t.adminToken),
    // Route the client's /api/aep requests straight into the in-memory engine.
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      url.pathname = url.pathname.replace(/^\/api\/aep/, '');
      return t.engine.fetch(new Request(url, init));
    }) as typeof fetch,
  });
}

async function create(path: string, body: Record<string, unknown> = {}): Promise<void> {
  const res = await call(t.engine, 'POST', path, { token: t.adminToken, body });
  expect(res.status, await res.clone().text()).toBe(201);
}

function stamp(plural: string, id: string, updated: string): void {
  t.engine.db.query(`UPDATE "${plural}" SET update_time = ? WHERE id = ?`).run(updated, id);
}

async function ids(path: string): Promise<string[]> {
  const res = await call(t.engine, 'GET', path, { token: t.adminToken });
  return ((await res.json()).results as Array<{ id: string }>).map((r) => r.id).sort();
}

beforeEach(async () => {
  t = await makeEngine();
  for (const def of DEFS) {
    const res = await defineResource(
      t,
      {
        singular: def.singular,
        plural: def.plural,
        parents: def.parents ?? [],
        user_settable_create: true,
        schema: toWireSchema(def.fields, def.singular),
      },
      def.singular,
    );
    expect(res.ok).toBe(true);
  }
});

describe('sweepRetention', () => {
  test('deletes rows past the window by update_time, and leaves fresh ones', async () => {
    await create('/memos?id=old');
    await create('/memos?id=fresh');
    stamp('memos', 'old', OLD);
    stamp('memos', 'fresh', FRESH);

    const [result] = await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT });
    expect(result).toMatchObject({ resource: 'memos', deleted: 1, blocked: 0, failed: 0, capped: false });
    expect(result!.cutoff).toBe('2026-09-24T03:00:00Z');
    expect(await ids('/memos')).toEqual(['fresh']);
  });

  test('takes the child subtree with the row', async () => {
    await create('/memos?id=old');
    await create('/memos/old/memo-notes?id=n1');
    stamp('memos', 'old', OLD);
    await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT });
    expect(await ids('/memos')).toEqual([]);
    expect(t.engine.db.query('SELECT COUNT(*) AS n FROM memo_notes').get()).toEqual({ n: 0 });
  });

  test('a restrict reference keeps its target, reported rather than forced', async () => {
    await create('/memos?id=pinned');
    await create('/memos?id=loose');
    await create('/pins?id=p1', { memo: 'pinned' });
    stamp('memos', 'pinned', OLD);
    stamp('memos', 'loose', OLD);

    const logs: string[] = [];
    const [result] = await sweepRetention({
      client: client(),
      defs: DEFS,
      firedAt: FIRED_AT,
      log: (m) => {
        logs.push(m);
      },
    });
    expect(result).toMatchObject({ deleted: 1, blocked: 1, failed: 0 });
    expect(await ids('/memos')).toEqual(['pinned']);
    expect(logs.some((l) => l.startsWith('memos/pinned: kept'))).toBe(true);
  });

  test('measures from a named field, falling back to update_time when it is unset', async () => {
    await create('/threads?id=quiet', { last_at: OLD });
    await create('/threads?id=active', { last_at: FRESH });
    await create('/threads?id=unset-old');
    await create('/threads?id=unset-fresh');
    // A recent write doesn't save a thread whose last activity is old…
    stamp('threads', 'quiet', FRESH);
    // …and an old write doesn't doom one whose last activity is recent.
    stamp('threads', 'active', OLD);
    stamp('threads', 'unset-old', OLD);
    stamp('threads', 'unset-fresh', FRESH);
    // 60 days, so OLD (~84 days) is past and FRESH is not.

    const results = await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT });
    expect(results.find((r) => r.resource === 'threads')).toMatchObject({ deleted: 2 });
    expect(await ids('/threads')).toEqual(['active', 'unset-fresh']);
  });

  test('caps each run, and says so, so a backlog drains over several runs', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      await create(`/memos?id=${id}`);
      stamp('memos', id, OLD);
    }
    const first = await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT, cap: 2 });
    expect(first[0]).toMatchObject({ deleted: 2, capped: true });
    expect(await ids('/memos')).toHaveLength(3);

    await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT, cap: 2 });
    const third = await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT, cap: 2 });
    expect(third[0]).toMatchObject({ deleted: 1, capped: false });
    expect(await ids('/memos')).toEqual([]);
  });

  test('a where condition limits which rows are ever eligible', async () => {
    const job: ResourceDefinition = {
      singular: 'job',
      plural: 'jobs',
      user_settable_create: true,
      retention: { days: 30, field: 'create_time', where: 'done == true' },
      fields: { done: { type: 'boolean' } },
    };
    await defineResource(
      t,
      { singular: 'job', plural: 'jobs', user_settable_create: true, schema: toWireSchema(job.fields, 'job') },
      'job',
    );
    for (const [id, done, created] of [
      ['finished-old', true, OLD],
      ['running-old', false, OLD],
      ['finished-fresh', true, FRESH],
    ] as const) {
      await create(`/jobs?id=${id}`, { done });
      // Measured from creation, so a recent write doesn't keep a row.
      t.engine.db
        .query('UPDATE jobs SET create_time = ?, update_time = ? WHERE id = ?')
        .run(created, FRESH, id);
    }
    const [result] = await sweepRetention({ client: client(), defs: [job], firedAt: FIRED_AT });
    expect(result).toMatchObject({ deleted: 1, failed: 0 });
    expect(await ids('/jobs')).toEqual(['finished-fresh', 'running-old']);
  });

  test('a where the engine rejects deletes nothing, and says so', async () => {
    await create('/memos?id=old');
    stamp('memos', 'old', OLD);
    const broken = { ...MEMO, retention: { days: 30, where: 'no_such_field == 1' } };
    const logs: string[] = [];
    const [result] = await sweepRetention({
      client: client(),
      defs: [broken],
      firedAt: FIRED_AT,
      log: (m) => {
        logs.push(m);
      },
    });
    expect(result).toMatchObject({ deleted: 0, failed: 1 });
    expect(await ids('/memos')).toEqual(['old']);
    expect(logs.some((l) => l.includes('could not list expired rows'))).toBe(true);
  });

  test('operations: finished ones go three days after creation; running ones never do', async () => {
    const [op] = operationsResources;
    await defineResource(
      t,
      { singular: op!.singular, plural: op!.plural, user_settable_create: true, schema: toWireSchema(op!.fields, op!.singular) },
      op!.singular,
    );
    const fourDaysAgo = '2026-10-20T03:00:00Z';
    const twoDaysAgo = '2026-10-22T03:00:00Z';
    for (const [id, done, created] of [
      ['done-4d', true, fourDaysAgo],
      ['done-2d', true, twoDaysAgo],
      ['running-4d', false, fourDaysAgo],
      ['running-ancient', false, OLD],
    ] as const) {
      await create(`/operations?id=${id}`, { done });
      t.engine.db.query('UPDATE operations SET create_time = ? WHERE id = ?').run(created, id);
    }
    const [result] = await sweepRetention({ client: client(), defs: operationsResources, firedAt: FIRED_AT });
    expect(result).toMatchObject({ resource: 'operations', deleted: 1, failed: 0 });
    expect(await ids('/operations')).toEqual(['done-2d', 'running-4d', 'running-ancient']);
  });

  test('sweeps a user-parented resource in every user’s subtree', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    const diary: ResourceDefinition = {
      singular: 'diary-entry',
      plural: 'diary-entries',
      parents: ['user'],
      user_settable_create: true,
      retention: { days: 30 },
      fields: { text: { type: 'string' } },
    };
    await defineResource(
      t,
      {
        singular: diary.singular,
        plural: diary.plural,
        parents: ['user'],
        user_settable_create: true,
        schema: toWireSchema(diary.fields, diary.singular),
      },
      diary.singular,
    );
    for (const [user, id, updated] of [
      [alice.user.id, 'a-old', OLD],
      [alice.user.id, 'a-fresh', FRESH],
      [bob.user.id, 'b-old', OLD],
    ] as const) {
      await create(`/users/${user}/diary-entries?id=${id}`);
      t.engine.db.query('UPDATE diary_entries SET update_time = ? WHERE id = ?').run(updated, id);
    }

    const logs: string[] = [];
    const [result] = await sweepRetention({
      client: client(),
      defs: [diary],
      firedAt: FIRED_AT,
      log: (m) => {
        logs.push(m);
      },
    });
    expect(result).toMatchObject({ resource: 'diary-entries', deleted: 2, failed: 0 });
    expect(await ids(`/users/${alice.user.id}/diary-entries`)).toEqual(['a-fresh']);
    expect(await ids(`/users/${bob.user.id}/diary-entries`)).toEqual([]);
  });

  test('scheduled notifications: an app’s rows go 30 days after their moment; a person’s stay', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    for (const def of notificationsResources) {
      await defineResource(
        t,
        {
          singular: def.singular,
          plural: def.plural,
          parents: def.parents ?? [],
          user_settable_create: true,
          schema: toWireSchema(def.fields, def.singular),
        },
        def.singular,
      );
    }
    const base = `/users/${alice.user.id}/scheduled-notifications`;
    const row = (send_at: string, source_app?: string) => ({
      title: 't',
      message: 'm',
      send_at,
      status: 'sent',
      ...(source_app ? { source_app, source_key: `k-${send_at}` } : {}),
    });
    await create(`${base}?id=app-old`, row(OLD, 'home')); // ~84 days past
    await create(`${base}?id=app-recent`, row('2026-10-10T00:00:00Z', 'events')); // 14 days past
    await create(`${base}?id=app-future`, row('2026-11-01T00:00:00Z', 'events'));
    await create(`${base}?id=mine-old`, row(OLD)); // a person scheduled it

    const results = await sweepRetention({
      client: client(),
      defs: notificationsResources,
      firedAt: FIRED_AT,
    });
    expect(results.find((r) => r.resource === 'scheduled-notifications')).toMatchObject({
      deleted: 1,
      failed: 0,
    });
    expect(await ids(base)).toEqual(['app-future', 'app-recent', 'mine-old']);
  });

  test('never touches a resource without a retention window', async () => {
    await create('/keepers?id=k');
    stamp('keepers', 'k', OLD);
    const results = await sweepRetention({ client: client(), defs: DEFS, firedAt: FIRED_AT });
    expect(results.map((r) => r.resource).sort()).toEqual(['memos', 'threads']);
    expect(await ids('/keepers')).toEqual(['k']);
  });
});
