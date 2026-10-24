/**
 * Filtering a list on the engine-managed timestamps, end to end over the API.
 * The rows' timestamps are rewritten in the table so the cases don't depend on
 * the wall clock.
 */

import { beforeEach, expect, test } from 'vitest';
import { BOOK_DEF, call, defineResource, makeEngine, seedOpenHousehold, type TestEngine } from './helpers';

let t: TestEngine;

beforeEach(async () => {
  t = await makeEngine();
  await seedOpenHousehold(t);
  await defineResource(t, BOOK_DEF);
  const stamps: Array<[string, string, string]> = [
    ['old', '2026-01-05T09:00:00Z', '2026-01-06T09:00:00Z'],
    ['mid', '2026-06-01T12:00:00Z', '2026-10-01T12:00:00Z'],
    ['new', '2026-10-20T08:30:00Z', '2026-10-23T23:59:59Z'],
  ];
  for (const [id, created, updated] of stamps) {
    expect((await call(t.engine, 'POST', `/books?id=${id}`, { token: t.adminToken, body: { title: id } })).status).toBe(201);
    t.engine.db.query('UPDATE books SET create_time = ?, update_time = ? WHERE id = ?').run(created, updated, id);
  }
});

async function listIds(filter: string, orderBy?: string): Promise<string[]> {
  const q = new URLSearchParams({ filter, ...(orderBy ? { order_by: orderBy } : {}) });
  const res = await call(t.engine, 'GET', `/books?${q}`, { token: t.adminToken });
  expect(res.status).toBe(200);
  return ((await res.json()).results as Array<{ id: string }>).map((r) => r.id);
}

test('update_time narrows a list to what changed recently', async () => {
  expect((await listIds('update_time > "2026-10-17T00:00:00Z"')).sort()).toEqual(['new']);
  expect((await listIds('update_time < "2026-10-17T00:00:00Z"')).sort()).toEqual(['mid', 'old']);
});

test('create_time bounds combine with other conditions and with ordering', async () => {
  expect(
    await listIds('create_time >= "2026-06-01T00:00:00Z" && create_time < "2026-11-01T00:00:00Z"', '-create_time'),
  ).toEqual(['new', 'mid']);
  expect(await listIds('create_time < "2026-07-01T00:00:00Z" && title == "old"')).toEqual(['old']);
});

test('path is still not filterable', async () => {
  const res = await call(t.engine, 'GET', `/books?${new URLSearchParams({ filter: 'path == "books/old"' })}`, {
    token: t.adminToken,
  });
  expect(res.status).toBe(400);
});
