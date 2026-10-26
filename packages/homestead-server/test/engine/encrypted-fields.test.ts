/**
 * `encrypted: true` fields (`x-aepbase-encrypted`): ciphertext at rest, the
 * value on read, no filtering or sorting, a 400 for a write with no master key,
 * and a sweep that encrypts plaintext already in a newly encrypted column.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';
import { __resetMasterKeyCacheForTests } from '../../src/engine/crypto';
import { sweepEncryption } from '../../src/engine/encrypted-fields';

let t: TestEngine;

function useKey(on: boolean): void {
  if (on) process.env.HOMESTEAD_MASTER_KEY = randomBytes(32).toString('base64');
  else delete process.env.HOMESTEAD_MASTER_KEY;
  __resetMasterKeyCacheForTests();
}

const VAULT = {
  singular: 'vault',
  plural: 'vaults',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      wifi_password: { type: 'string', 'x-aepbase-encrypted': true },
      card: { type: 'object', 'x-aepbase-encrypted': true, properties: { number: { type: 'string' } } },
      codes: { type: 'array', 'x-aepbase-encrypted': true, items: { type: 'string' } },
    },
    required: ['name'],
  },
};

function raw(path: string, column: string): string | null {
  const row = t.engine.db.query(`SELECT ${column} AS v FROM vaults WHERE path = ?`).get(path) as
    | { v: string | null }
    | null;
  return row ? row.v : null;
}

const create = (id: string, body: Record<string, unknown>) =>
  call(t.engine, 'POST', `/vaults?id=${id}`, { token: t.adminToken, body });

beforeEach(async () => {
  useKey(true);
  t = await makeEngine();
  expect((await defineResource(t, VAULT, 'vault')).ok).toBe(true);
});

afterEach(() => useKey(false));

describe('with a master key', () => {
  test('strings, objects and arrays are ciphertext on disk and values on read', async () => {
    const res = await create('v1', {
      name: 'Home',
      wifi_password: 'hunter2',
      card: { number: '4111' },
      codes: ['1234', '5678'],
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ wifi_password: 'hunter2', card: { number: '4111' }, codes: ['1234', '5678'] });

    for (const column of ['wifi_password', 'card', 'codes']) {
      expect(raw('vaults/v1', column)?.startsWith('enc:v1:')).toBe(true);
    }
    expect(raw('vaults/v1', 'wifi_password')).not.toContain('hunter2');
    expect(raw('vaults/v1', 'card')).not.toContain('4111');

    const got = await (await call(t.engine, 'GET', '/vaults/v1', { token: t.adminToken })).json();
    expect(got).toMatchObject({ wifi_password: 'hunter2', card: { number: '4111' }, codes: ['1234', '5678'] });
    const list = await (await call(t.engine, 'GET', '/vaults', { token: t.adminToken })).json();
    expect(list.results[0].codes).toEqual(['1234', '5678']);
  });

  test('an update re-encrypts, and null clears', async () => {
    await create('v2', { name: 'Home', wifi_password: 'old' });
    await call(t.engine, 'PATCH', '/vaults/v2', { token: t.adminToken, body: { wifi_password: 'new' } });
    expect(raw('vaults/v2', 'wifi_password')?.startsWith('enc:v1:')).toBe(true);
    expect((await (await call(t.engine, 'GET', '/vaults/v2', { token: t.adminToken })).json()).wifi_password).toBe('new');

    await call(t.engine, 'PATCH', '/vaults/v2', { token: t.adminToken, body: { wifi_password: null } });
    expect(raw('vaults/v2', 'wifi_password')).toBeNull();
  });

  test("can't be filtered or sorted", async () => {
    await create('v3', { name: 'Home', wifi_password: 'x' });
    const filter = await call(t.engine, 'GET', `/vaults?filter=${encodeURIComponent('wifi_password == "x"')}`, {
      token: t.adminToken,
    });
    expect(filter.status).toBe(400);
    expect(await filter.text()).toContain('encrypted');
    const order = await call(t.engine, 'GET', '/vaults?order_by=wifi_password', { token: t.adminToken });
    expect(order.status).toBe(400);
  });
});

describe('without a master key', () => {
  beforeEach(() => useKey(false));

  test('a write that sets an encrypted field is refused, and says how to fix it', async () => {
    const res = await create('v4', { name: 'Home', wifi_password: 'hunter2' });
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: { message: string } };
    expect(error.message).toContain('field "wifi_password" is encrypted at rest');
    expect(error.message).toContain('homestead key generate');
    expect(t.engine.db.query("SELECT COUNT(*) AS n FROM vaults").get()).toEqual({ n: 0 });

    const several = await create('v5', { name: 'Home', wifi_password: 'a', codes: ['1'] });
    const both = (await several.json()) as { error: { message: string } };
    expect(both.error.message).toContain('fields "wifi_password", "codes" are encrypted');
  });

  test('writes that leave encrypted fields empty, or untouched, still work', async () => {
    expect((await create('v6', { name: 'Home' })).status).toBe(201);
    expect((await create('v7', { name: 'Home', wifi_password: '' })).status).toBe(201);
    expect((await create('v8', { name: 'Home', wifi_password: null })).status).toBe(201);
    const patch = await call(t.engine, 'PATCH', '/vaults/v6', { token: t.adminToken, body: { name: 'Cabin' } });
    expect(patch.status).toBe(200);
    const apply = await call(t.engine, 'PUT', '/vaults/v6', {
      token: t.adminToken,
      body: { name: 'Cabin', wifi_password: 'x' },
    });
    expect(apply.status).toBe(400);
  });
});

describe('the sweep', () => {
  test('marking a field encrypted encrypts the plaintext it already holds', async () => {
    const plain = {
      ...VAULT,
      singular: 'note',
      plural: 'notes',
      schema: { type: 'object', properties: { body: { type: 'string' } } },
    };
    expect((await defineResource(t, plain, 'note')).ok).toBe(true);
    await call(t.engine, 'POST', '/notes?id=n1', { token: t.adminToken, body: { body: 'gate code 4321' } });
    const before = t.engine.db.query("SELECT body FROM notes WHERE path = 'notes/n1'").get() as { body: string };
    expect(before.body).toBe('gate code 4321');

    const res = await call(t.engine, 'PATCH', '/aep-resource-definitions/note', {
      token: t.adminToken,
      body: { schema: { type: 'object', properties: { body: { type: 'string', 'x-aepbase-encrypted': true } } } },
    });
    expect(res.status).toBe(200);
    const after = t.engine.db.query("SELECT body FROM notes WHERE path = 'notes/n1'").get() as { body: string };
    expect(after.body.startsWith('enc:v1:')).toBe(true);
    expect((await (await call(t.engine, 'GET', '/notes/n1', { token: t.adminToken })).json()).body).toBe(
      'gate code 4321',
    );
  });

  test('plaintext written before the instance had a key is encrypted once it has one', async () => {
    // A row from before the key: plaintext in the encrypted column.
    t.engine.db
      .query("INSERT INTO vaults (id, path, create_time, update_time, name, wifi_password) VALUES (?, ?, ?, ?, ?, ?)")
      .run('old', 'vaults/old', 't', 't', 'Home', 'legacy-pass');
    const resource = t.engine.registry.get('vault')!;
    expect(sweepEncryption(t.engine.db, resource)).toBe(1);
    expect(raw('vaults/old', 'wifi_password')?.startsWith('enc:v1:')).toBe(true);
    expect(sweepEncryption(t.engine.db, resource)).toBe(0);
    expect((await (await call(t.engine, 'GET', '/vaults/old', { token: t.adminToken })).json()).wifi_password).toBe(
      'legacy-pass',
    );

    useKey(false);
    expect(sweepEncryption(t.engine.db, resource)).toBe(0);
  });
});

describe('definitions', () => {
  const bad = async (prop: Record<string, unknown>) => {
    const res = await call(t.engine, 'POST', '/aep-resource-definitions?id=bad', {
      token: t.adminToken,
      body: { singular: 'bad', plural: 'bads', schema: { type: 'object', properties: { f: prop } } },
    });
    return { status: res.status, text: await res.text() };
  };

  test('refuse encrypted markers the engine could not honor', async () => {
    expect(await bad({ type: 'number', 'x-aepbase-encrypted': true })).toMatchObject({ status: 400 });
    expect((await bad({ type: 'string', 'x-aepbase-encrypted': true, enum: ['a'] })).status).toBe(400);
    expect(
      (await bad({ type: 'string', 'x-aepbase-encrypted': true, 'x-aepbase-reference': { resource: 'user' } })).status,
    ).toBe(400);
    expect(
      (await bad({ type: 'object', properties: { inner: { type: 'string', 'x-aepbase-encrypted': true } } })).text,
    ).toContain('only top-level');
  });
});
