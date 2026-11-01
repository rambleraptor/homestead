/**
 * The link graph (`src/engine/links.ts`) and `include` (`src/engine/include.ts`):
 * a read that brings the records it's linked to along — outbound and inbound
 * references in either stored id form, child collections and parents — under
 * `$included`, each decided as a GET of it would be, and bounded.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import type { FieldDef } from '@rambleraptor/homestead-core/resources/types';
import type { User } from '../../src/engine/types';
import { linksOf } from '../../src/engine/links';
import { PER_LINK } from '../../src/engine/include';
import { call, defineResource, installOpenGrant, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';
let t: TestEngine;
let alice: { user: User; token: string };

const def = (singular: string, plural: string, fields: Record<string, FieldDef>, parents: string[] = []) => ({
  singular,
  plural,
  parents,
  user_settable_create: true,
  schema: toWireSchema(fields, singular),
});

const PERSON = def('person', 'people', { name: { type: 'string', required: true } });
const HOUSEHOLD = def('household', 'households', {
  name: { type: 'string', required: true },
  line1: { type: 'string' },
  members: { type: 'array', items: { type: 'string', reference: { resource: 'person' } } },
});
const RELATIONSHIP = def('person-relationship', 'person-relationships', {
  person_a: { type: 'string', reference: { resource: 'person' } },
  person_b: { type: 'string', reference: { resource: 'person' } },
});
const CARD = def('gift-card', 'gift-cards', {
  merchant: { type: 'string', required: true },
  owner: { type: 'string', reference: { resource: 'person' } },
});
const TRANSACTION = def('transaction', 'transactions', { amount: { type: 'number' } }, ['gift-card']);

const as = (token: string) => ({
  get: (path: string) => call(t.engine, 'GET', path, { token }),
  post: (path: string, body: unknown) => call(t.engine, 'POST', path, { token, body }),
});
const admin = () => as(t.adminToken);
const json = async (res: Response) => {
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, any>;
};

beforeEach(async () => {
  process.env.PERMISSION_CACHE_TTL_MS = '0';
  t = await makeEngine();
  for (const permission of PERMISSION_RESOURCE_DEFS) {
    await defineResource(
      t,
      {
        singular: permission.singular,
        plural: permission.plural,
        parents: permission.parents ?? [],
        superuser_write: permission.superuser_write ?? false,
        independent_access: permission.independent_access ?? false,
        schema: toWireSchema(permission.fields, permission.singular),
      },
      permission.singular,
    );
  }
  for (const d of [PERSON, HOUSEHOLD, RELATIONSHIP, CARD, TRANSACTION]) {
    expect((await defineResource(t, d, d.singular)).ok).toBe(true);
  }
  await seedPermissions(BASE, t.adminToken, (input, init) => t.engine.fetch(new Request(input, init)));
  alice = await seedUser(t.engine, { email: 'alice@example.com' });

  const a = admin();
  await a.post('/people?id=jake', { name: 'Jake Miller' });
  await a.post('/people?id=sam', { name: 'Sam Miller' });
  // Both stored forms of a reference: the bare id and the path.
  await a.post('/households?id=oak', { name: 'Millers', line1: '12 Oak St', members: ['jake', 'people/sam'] });
  await a.post('/households?id=lake', { name: 'Lake house', line1: '1 Shore Rd', members: ['people/jake'] });
  await a.post('/person-relationships?id=r1', { person_a: 'jake', person_b: 'sam' });
  await a.post('/gift-cards?id=g1', { merchant: 'REI', owner: 'jake' });
  await a.post('/gift-cards/g1/transactions?id=t1', { amount: 5 });
  await a.post('/gift-cards/g1/transactions?id=t2', { amount: 7 });
});

afterEach(() => {
  delete process.env.PERMISSION_CACHE_TTL_MS;
});

describe('the link graph', () => {
  test('is read off the references and parents, in both directions', () => {
    const reg = t.engine.registry;
    const names = (singular: string) => [...linksOf(reg, reg.get(singular)!).keys()].sort();
    expect(names('person')).toEqual([
      'gift-cards',
      'households',
      'person-relationships.person_a',
      'person-relationships.person_b',
    ]);
    expect(names('household')).toEqual(['members']);
    expect(names('gift-card')).toEqual(['owner', 'transactions']);
    expect(names('transaction')).toEqual(['parent']);
  });
});

describe('include', () => {
  test('brings a person’s households along, matching either stored id form', async () => {
    const body = await json(await admin().get('/people?filter=name.contains("jake")&include=households'));
    expect(body.results).toHaveLength(1);
    const households = body.results[0].$included.households;
    expect(households.more).toBe(false);
    expect(households.results.map((h: { id: string }) => h.id).sort()).toEqual(['lake', 'oak']);
    expect(households.results.find((h: { id: string }) => h.id === 'oak').line1).toBe('12 Oak St');

    const sam = await json(await admin().get('/people/sam?include=households'));
    expect(sam.$included.households.results.map((h: { id: string }) => h.id)).toEqual(['oak']);
  });

  test('follows an outbound reference field, one record or many', async () => {
    const oak = await json(await admin().get('/households/oak?include=members'));
    expect(oak.$included.members.results.map((p: { name: string }) => p.name).sort()).toEqual([
      'Jake Miller',
      'Sam Miller',
    ]);
    const card = await json(await admin().get('/gift-cards/g1?include=owner,transactions'));
    expect(card.$included.owner).toMatchObject({ id: 'jake', name: 'Jake Miller' });
    expect(card.$included.transactions.results.map((x: { id: string }) => x.id).sort()).toEqual(['t1', 't2']);
  });

  test('a child’s parent, and a link named by its field when a collection points twice', async () => {
    const tx = await json(await admin().get('/gift-cards/g1/transactions/t1?include=parent'));
    expect(tx.$included.parent).toMatchObject({ id: 'g1', merchant: 'REI' });
    const jake = await json(await admin().get('/people/jake?include=person-relationships.person_a'));
    expect(jake.$included['person-relationships.person_a'].results.map((r: { id: string }) => r.id)).toEqual(['r1']);
  });

  test('a record the caller can’t read is left out, as if it didn’t exist', async () => {
    // Alice may read people, but no households.
    await call(t.engine, 'POST', '/access-grants?id=alice-people', {
      token: t.adminToken,
      body: {
        subject_type: 'user',
        subject_id: alice.user.id,
        target_scope: 'collection',
        resource_type: 'person',
        capability: 'read',
        effect: 'allow',
      },
    });
    t.engine.reloadPermissions();
    const jake = await json(await as(alice.token).get('/people/jake?include=households'));
    expect(jake.$included.households).toEqual({ results: [], more: false });

    await call(t.engine, 'POST', '/access-grants?id=alice-oak', {
      token: t.adminToken,
      body: {
        subject_type: 'user',
        subject_id: alice.user.id,
        target_scope: 'record',
        resource_type: 'household',
        resource_id: 'oak',
        capability: 'read',
        effect: 'allow',
      },
    });
    t.engine.reloadPermissions();
    const again = await json(await as(alice.token).get('/people/jake?include=households'));
    expect(again.$included.households.results.map((h: { id: string }) => h.id)).toEqual(['oak']);
  });

  test(`a link brings at most ${PER_LINK} records per record, and says there are more`, async () => {
    for (let i = 0; i < PER_LINK + 2; i++) {
      await admin().post(`/households?id=h${i}`, { name: `Home ${i}`, members: ['jake'] });
    }
    const jake = await json(await admin().get('/people/jake?include=households'));
    expect(jake.$included.households.results).toHaveLength(PER_LINK);
    expect(jake.$included.households.more).toBe(true);
  });

  test('an unknown link is refused with the ones there are; so are too many', async () => {
    const unknown = await admin().get('/people?include=addresses');
    expect(unknown.status).toBe(400);
    const message = ((await unknown.json()) as { error: { message: string } }).error.message;
    expect(message).toContain('no link named "addresses"');
    expect(message).toContain('households');

    const tooMany = await admin().get(
      '/people?include=households,gift-cards,person-relationships.person_a,person-relationships.person_b',
    );
    expect(tooMany.status).toBe(400);
  });

  test('a read without include is unchanged', async () => {
    const jake = await json(await admin().get('/people/jake'));
    expect(jake).not.toHaveProperty('$included');
  });
});
