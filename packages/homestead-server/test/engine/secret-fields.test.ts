/**
 * `secret: true` fields (`x-aepbase-secret`): encrypted like any encrypted
 * field, read back only as a descriptor, kept by a write that sends the
 * descriptor or leaves the field out, and read in-process with
 * `Engine.readSecret`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';
import { __resetMasterKeyCacheForTests } from '../../src/engine/crypto';
import type { SyncDispatchInput } from '../../src/sync';

let t: TestEngine;

function useKey(on: boolean): void {
  if (on) process.env.HOMESTEAD_MASTER_KEY = randomBytes(32).toString('base64');
  else delete process.env.HOMESTEAD_MASTER_KEY;
  __resetMasterKeyCacheForTests();
}

const API_KEY = 'sk-live-0123456789abcdef3f9a';

const CREDENTIAL = {
  singular: 'credential',
  plural: 'credentials',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      api_key: { type: 'string', 'x-aepbase-secret': { hint: 4 } },
      password: { type: 'string', 'x-aepbase-secret': true },
      tokens: { type: 'object', 'x-aepbase-secret': true, properties: { access: { type: 'string' } } },
    },
    required: ['name'],
  },
};

function raw(path: string, column: string): string | null {
  const row = t.engine.db.query(`SELECT ${column} AS v FROM credentials WHERE path = ?`).get(path) as
    | { v: string | null }
    | null;
  return row ? row.v : null;
}

const create = (id: string, body: Record<string, unknown>) =>
  call(t.engine, 'POST', `/credentials?id=${id}`, { token: t.adminToken, body });
const get = async (id: string) =>
  (await (await call(t.engine, 'GET', `/credentials/${id}`, { token: t.adminToken })).json()) as Record<
    string,
    unknown
  >;
const patch = (id: string, body: Record<string, unknown>) =>
  call(t.engine, 'PATCH', `/credentials/${id}`, { token: t.adminToken, body });
const secret = (id: string, field: string) => t.engine.readSecret('credential', `credentials/${id}`, field);

beforeEach(async () => {
  useKey(true);
  t = await makeEngine();
  expect((await defineResource(t, CREDENTIAL, 'credential')).ok).toBe(true);
});

afterEach(() => useKey(false));

describe('reading', () => {
  test('every read gets a descriptor; the value is only on disk, encrypted', async () => {
    const res = await create('c1', {
      name: 'AI',
      api_key: API_KEY,
      password: 'correct horse battery',
      tokens: { access: 'at-123' },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    const body = JSON.stringify(created);
    for (const value of [API_KEY, 'correct horse', 'at-123']) expect(body).not.toContain(value);

    expect(created.api_key).toMatchObject({ $secret: true, set: true, hint: '…3f9a' });
    expect(typeof (created.api_key as { set_time: unknown }).set_time).toBe('string');
    // No hint unless the field asks for one.
    expect(created.password).not.toHaveProperty('hint');
    expect(created.tokens).toMatchObject({ $secret: true, set: true });

    for (const column of ['api_key', 'password', 'tokens']) {
      expect(raw('credentials/c1', column)?.startsWith('enc:v1:')).toBe(true);
    }
    expect(raw('credentials/c1', 'api_key')).not.toContain(API_KEY);

    expect((await get('c1')).api_key).toEqual(created.api_key);
    const list = await (await call(t.engine, 'GET', '/credentials', { token: t.adminToken })).json();
    expect(JSON.stringify(list)).not.toContain(API_KEY);
    expect(list.results[0].password).toMatchObject({ $secret: true, set: true });
  });

  test('an unset secret reads as not set', async () => {
    await create('c2', { name: 'Empty' });
    expect((await get('c2')).api_key).toEqual({ $secret: true, set: false });
  });

  test("a hint isn't shown for a value too short to spare it", async () => {
    await create('c3', { name: 'Short', api_key: 'abcdefgh' });
    expect((await get('c3')).api_key).not.toHaveProperty('hint');
  });

  test('server code reads the value in-process', async () => {
    await create('c4', { name: 'AI', api_key: API_KEY, tokens: { access: 'at-123' } });
    expect(secret('c4', 'api_key')).toBe(API_KEY);
    expect(secret('c4', 'tokens')).toEqual({ access: 'at-123' });
    expect(secret('c4', 'password')).toBeNull();
    expect(t.engine.readSecret('credential', 'credentials/missing', 'api_key')).toBeNull();
    expect(() => secret('c4', 'name')).toThrow('not a secret field');
    expect(() => t.engine.readSecret('credential', 'notes/c4', 'api_key')).toThrow('not a credential record');
  });

  test('the change feed carries descriptors too', async () => {
    const events: SyncDispatchInput[] = [];
    t.engine.setSyncDispatcher({ dispatch: (input) => void events.push(input) });
    await create('c5', { name: 'AI', api_key: API_KEY });
    await patch('c5', { api_key: `${API_KEY}-rotated` });
    expect(events.map((e) => e.event)).toEqual(['create', 'update']);
    expect(JSON.stringify(events)).not.toContain(API_KEY);
    expect(events[1]!.record?.api_key).toMatchObject({ $secret: true, set: true });
  });

  test("can't be filtered or sorted", async () => {
    await create('c6', { name: 'AI', api_key: API_KEY });
    const filter = await call(t.engine, 'GET', `/credentials?filter=${encodeURIComponent(`api_key == "${API_KEY}"`)}`, {
      token: t.adminToken,
    });
    expect(filter.status).toBe(400);
    const order = await call(t.engine, 'GET', '/credentials?order_by=api_key', { token: t.adminToken });
    expect(order.status).toBe(400);
  });
});

describe('writing', () => {
  test('sending back the descriptor, or leaving the field out, keeps the value', async () => {
    await create('w1', { name: 'AI', api_key: API_KEY, tokens: { access: 'at-123' } });
    const read = await get('w1');

    // A form saving the whole record it read.
    const saved = await patch('w1', { ...read, name: 'Assistant' });
    expect(saved.status).toBe(200);
    expect(secret('w1', 'api_key')).toBe(API_KEY);
    expect(secret('w1', 'tokens')).toEqual({ access: 'at-123' });
    expect((await saved.json()).api_key).toEqual(read.api_key);

    // Apply (PUT) leaves out what it doesn't send.
    const applied = await call(t.engine, 'PUT', '/credentials/w1', { token: t.adminToken, body: { name: 'Again' } });
    expect(applied.status).toBe(200);
    expect(secret('w1', 'api_key')).toBe(API_KEY);
  });

  test('a value replaces it, and null or an empty string clears it', async () => {
    await create('w2', { name: 'AI', api_key: API_KEY, password: 'first-password' });
    await patch('w2', { api_key: 'sk-rotated-0000000000000000beef' });
    expect(secret('w2', 'api_key')).toBe('sk-rotated-0000000000000000beef');
    expect((await get('w2')).api_key).toMatchObject({ hint: '…beef' });

    await patch('w2', { api_key: null, password: '' });
    expect(secret('w2', 'api_key')).toBeNull();
    expect(secret('w2', 'password')).toBeNull();
    expect((await get('w2')).api_key).toEqual({ $secret: true, set: false });
    expect(raw('credentials/w2', 'api_key')).toBeNull();
  });

  test('an object secret is replaced whole, not merged', async () => {
    await create('w3', { name: 'Google', tokens: { access: 'a1', refresh: 'r1' } });
    await patch('w3', { tokens: { access: 'a2' } });
    expect(secret('w3', 'tokens')).toEqual({ access: 'a2' });
  });

  test('the value is still type-checked', async () => {
    expect((await create('w4', { name: 'AI', api_key: 42 })).status).toBe(400);
    expect((await create('w5', { name: 'AI', tokens: 'not an object' })).status).toBe(400);
  });

  test('without a master key, setting one is refused', async () => {
    useKey(false);
    const res = await create('w6', { name: 'AI', api_key: API_KEY });
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: { message: string } };
    expect(error.message).toContain('field "api_key" is encrypted at rest');
    expect((await create('w7', { name: 'AI' })).status).toBe(201);
  });
});

describe('OpenAPI', () => {
  test('documents a secret as the descriptor it reads as', async () => {
    const doc = await (await call(t.engine, 'GET', '/openapi.json')).json();
    const apiKey = doc.components.schemas.credential.properties.api_key;
    expect(apiKey.type).toBe('object');
    expect(Object.keys(apiKey.properties)).toEqual(['$secret', 'set', 'set_time', 'hint']);
    expect(apiKey.description).toContain('Write-only: write a string to set it');
    expect(doc.components.schemas.credential.properties.tokens.description).toContain('write an object');
  });
});

describe('definitions', () => {
  test('marking a field secret encrypts what it holds, and reads stop returning it', async () => {
    const plain = {
      singular: 'service',
      plural: 'services',
      user_settable_create: true,
      schema: { type: 'object', properties: { token: { type: 'string' } } },
    };
    expect((await defineResource(t, plain, 'service')).ok).toBe(true);
    await call(t.engine, 'POST', '/services?id=s1', { token: t.adminToken, body: { token: 'legacy-token-value' } });

    const res = await call(t.engine, 'PATCH', '/aep-resource-definitions/service', {
      token: t.adminToken,
      body: { schema: { type: 'object', properties: { token: { type: 'string', 'x-aepbase-secret': true } } } },
    });
    expect(res.status).toBe(200);
    const row = t.engine.db.query("SELECT token FROM services WHERE path = 'services/s1'").get() as { token: string };
    expect(row.token.startsWith('enc:v1:')).toBe(true);
    const got = await (await call(t.engine, 'GET', '/services/s1', { token: t.adminToken })).json();
    // Set before it was a secret, so when isn't known.
    expect(got.token).toEqual({ $secret: true, set: true });
    expect(t.engine.readSecret('service', 'services/s1', 'token')).toBe('legacy-token-value');
  });

  test("a field can't stop being secret while it holds values", async () => {
    await create('d1', { name: 'AI', api_key: API_KEY });
    const unmark = () =>
      call(t.engine, 'PATCH', '/aep-resource-definitions/credential', {
        token: t.adminToken,
        body: {
          schema: {
            ...CREDENTIAL.schema,
            properties: { ...CREDENTIAL.schema.properties, api_key: { type: 'string' } },
          },
        },
      });
    const refused = await unmark();
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain('holds secrets');

    await patch('d1', { api_key: null });
    expect((await unmark()).status).toBe(200);
  });

  test('refuse secret markers the engine could not honor', async () => {
    const bad = async (prop: Record<string, unknown>) =>
      call(t.engine, 'POST', '/aep-resource-definitions?id=bad', {
        token: t.adminToken,
        body: { singular: 'bad', plural: 'bads', schema: { type: 'object', properties: { f: prop } } },
      });
    expect((await bad({ type: 'number', 'x-aepbase-secret': true })).status).toBe(400);
    expect((await bad({ type: 'string', 'x-aepbase-secret': { hint: 20 } })).status).toBe(400);
    expect((await bad({ type: 'string', 'x-aepbase-secret': { reveal: true } })).status).toBe(400);
    const nested = await bad({ type: 'object', properties: { inner: { type: 'string', 'x-aepbase-secret': true } } });
    expect(await nested.text()).toContain('only top-level');
  });
});
