/**
 * Dynamic field defaults sourced from a household app-flag singleton: a field
 * with an `x-aepbase-default-from` marker is filled, on create / full-replace,
 * from the named column of the source collection's single row when the request
 * omits it. This is what carries the "default grocery store" to every write
 * path (chat tools, cron hooks, image import) rather than just the web form.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';

let t: TestEngine;

/**
 * Define an `app-flags` singleton (a `default_store` flag column), a `store`,
 * and a `grocery` whose `store` defaults from that flag when omitted.
 */
async function seedSchema(): Promise<void> {
  await defineResource(t, {
    singular: 'app-flag',
    plural: 'app-flags',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: { groceries__default_store: { type: 'string' } },
    },
  });
  await defineResource(t, {
    singular: 'store',
    plural: 'stores',
    user_settable_create: true,
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  });
  await defineResource(t, {
    singular: 'grocery',
    plural: 'groceries',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        store: {
          type: 'string',
          'x-aepbase-reference': { resource: 'store' },
          'x-aepbase-default-from': {
            resource: 'app-flags',
            field: 'groceries__default_store',
          },
        },
      },
    },
  });
}

/** Set (upsert) the household default_store flag value. */
async function setDefaultStore(value: string): Promise<void> {
  const list = await (
    await call(t.engine, 'GET', '/app-flags', { token: t.adminToken })
  ).json();
  const existing = list.results?.[0];
  if (existing) {
    await call(t.engine, 'PATCH', `/app-flags/${existing.id}`, {
      token: t.adminToken,
      contentType: 'application/merge-patch+json',
      body: { groceries__default_store: value },
    });
  } else {
    await call(t.engine, 'POST', '/app-flags', {
      token: t.adminToken,
      body: { groceries__default_store: value },
    });
  }
}

async function createStore(name: string): Promise<string> {
  const res = await call(t.engine, 'POST', '/stores', { token: t.adminToken, body: { name } });
  return (await res.json()).id as string;
}

beforeEach(async () => {
  t = await makeEngine();
  await seedSchema();
});

describe('dynamic defaults from an app flag', () => {
  test('fills an omitted field from the flag value', async () => {
    const store = await createStore('Costco');
    await setDefaultStore(store);

    const res = await call(t.engine, 'POST', '/groceries', {
      token: t.adminToken,
      body: { name: 'Milk' },
    });
    expect(res.status).toBe(201);
    expect((await res.json()).store).toBe(store);
  });

  test('leaves an explicitly supplied value untouched', async () => {
    const preferred = await createStore('Costco');
    const other = await createStore('Safeway');
    await setDefaultStore(preferred);

    const res = await call(t.engine, 'POST', '/groceries', {
      token: t.adminToken,
      body: { name: 'Milk', store: other },
    });
    expect((await res.json()).store).toBe(other);
  });

  test('skips a blank flag: no default configured stays no default', async () => {
    await setDefaultStore('');

    const res = await call(t.engine, 'POST', '/groceries', {
      token: t.adminToken,
      body: { name: 'Milk' },
    });
    const body = await res.json();
    expect(body.store === undefined || body.store === null || body.store === '').toBe(true);
  });

  test('skips when the flag row does not exist at all', async () => {
    const res = await call(t.engine, 'POST', '/groceries', {
      token: t.adminToken,
      body: { name: 'Eggs' },
    });
    const body = await res.json();
    expect(body.store === undefined || body.store === null || body.store === '').toBe(true);
  });

  test('applies on full-replace (PUT) as well as create', async () => {
    const store = await createStore('Costco');
    await setDefaultStore(store);

    // Apply to a fresh id creates (201); to an existing one updates (200) —
    // either way the omitted store is filled from the flag.
    const res = await call(t.engine, 'PUT', '/groceries/g1', {
      token: t.adminToken,
      body: { name: 'Bread' },
    });
    expect([200, 201]).toContain(res.status);
    expect((await res.json()).store).toBe(store);
  });
});

describe('stamp: create', () => {
  beforeEach(async () => {
    await defineResource(t, {
      singular: 'jotting',
      plural: 'jottings',
      user_settable_create: true,
      schema: {
        type: 'object',
        properties: {
          body: { type: 'string' },
          written_at: { type: 'string', format: 'date-time', 'x-aepbase-stamp': 'create' },
        },
      },
    });
  });

  test('fills an omitted stamp with the time of the write', async () => {
    const res = await call(t.engine, 'POST', '/jottings', { token: t.adminToken, body: { body: 'hi' } });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.written_at).toBe(created.create_time);
  });

  test("keeps the writer's own time", async () => {
    const res = await call(t.engine, 'POST', '/jottings', {
      token: t.adminToken,
      body: { body: 'written offline', written_at: '2026-01-02T09:00:00.000Z' },
    });
    expect((await res.json()).written_at).toBe('2026-01-02T09:00:00.000Z');
  });
});
