/**
 * `Engine.collectionAccess` — which collections a caller could read or write,
 * for the model-facing tool surfaces. It must say yes wherever some request
 * would pass (a model offered too little can't do what the person can) and no
 * where none could (a tool that only 403s).
 *
 * Fixture as in permission-inherit: books → chapters → notes, reviews under
 * books with `independent_access`, bookmarks under users. Alice owns b1 and b2;
 * the open baseline is gone, so access is owner + whatever a test grants.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { insertToken } from '../../src/engine/users';
import { generatePatSecret } from '../../src/engine/pat';
import { MCP_SCOPE_READ } from '../../src/auth/scopes';
import type { User } from '../../src/engine/types';
import {
  BOOK_DEF,
  call,
  defineResource,
  installOpenGrant,
  makeEngine,
  seedUser,
  type TestEngine,
} from './helpers';

const BASE = 'http://localhost:8090';

const titled = { type: 'object', properties: { title: { type: 'string' } } };

const CHAPTER_DEF = { singular: 'chapter', plural: 'chapters', parents: ['book'], user_settable_create: true, schema: titled };
const NOTE_DEF = { singular: 'note', plural: 'notes', parents: ['chapter'], user_settable_create: true, schema: titled };
const REVIEW_DEF = {
  singular: 'review',
  plural: 'reviews',
  parents: ['book'],
  user_settable_create: true,
  independent_access: true,
  schema: titled,
};
const BOOKMARK_DEF = { singular: 'bookmark', plural: 'bookmarks', parents: ['user'], user_settable_create: true, schema: titled };
const SETTING_DEF = { singular: 'setting', plural: 'settings', superuser_write: true, schema: titled };

let t: TestEngine;
let alice: { user: User; token: string };
let bob: { user: User; token: string };

async function grant(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await call(t.engine, 'POST', `/access-grants?id=${id}`, { token: t.adminToken, body });
  expect(res.status).toBe(201);
  t.engine.reloadPermissions();
}

const forUser = (user: User, capability: 'read' | 'write', target: Record<string, unknown>) => ({
  subject_type: 'user',
  subject_id: user.id,
  capability,
  ...target,
});

function access(caller: User, singular: string) {
  return t.engine.collectionAccess(caller).get(singular);
}

beforeEach(async () => {
  process.env.PERMISSION_CACHE_TTL_MS = '0';
  t = await makeEngine();
  for (const def of PERMISSION_RESOURCE_DEFS) {
    await defineResource(
      t,
      {
        singular: def.singular,
        plural: def.plural,
        parents: def.parents ?? [],
        superuser_write: def.superuser_write ?? false,
        independent_access: def.independent_access ?? false,
        schema: toWireSchema(def.fields, def.singular),
      },
      def.singular,
    );
  }
  for (const def of [BOOK_DEF, CHAPTER_DEF, NOTE_DEF, REVIEW_DEF, BOOKMARK_DEF, SETTING_DEF]) {
    expect((await defineResource(t, def, def.singular)).ok).toBe(true);
  }
  await seedPermissions(BASE, t.adminToken, (input, init) => t.engine.fetch(new Request(input, init)));

  alice = await seedUser(t.engine, { email: 'alice@example.com' });
  bob = await seedUser(t.engine, { email: 'bob@example.com' });

  await installOpenGrant(t);
  for (const path of ['/books?id=b1', '/books?id=b2', '/books/b1/chapters?id=c1', '/books/b1/reviews?id=r1']) {
    const res = await call(t.engine, 'POST', path, { token: alice.token, body: { title: 'x' } });
    expect(res.status).toBe(201);
  }
  expect((await call(t.engine, 'DELETE', '/access-grants/open-household', { token: t.adminToken })).status).toBe(204);
  t.engine.reloadPermissions();
});

afterEach(() => {
  delete process.env.PERMISSION_CACHE_TTL_MS;
});

describe('own collections', () => {
  test('nothing granted and nothing owned: no access', () => {
    expect(access(bob.user, 'book')).toEqual({ read: false, write: false });
    expect(access(bob.user, 'review')).toEqual({ read: false, write: false });
  });

  test('a row the caller owns is reachable, for writing too', () => {
    expect(access(alice.user, 'book')).toEqual({ read: true, write: true });
    expect(access(alice.user, 'review')).toEqual({ read: true, write: true });
  });

  test('a collection grant gives exactly its capability', async () => {
    await grant('read-books', forUser(bob.user, 'read', { target_scope: 'collection', resource_type: 'book' }));
    expect(access(bob.user, 'book')).toEqual({ read: true, write: false });
  });

  test('a filtered grant counts, rows or not — it also governs create', async () => {
    await grant(
      'own-books',
      forUser(bob.user, 'write', {
        target_scope: 'collection',
        resource_type: 'book',
        filter: 'title == "bob"',
      }),
    );
    expect(access(bob.user, 'book')).toEqual({ read: true, write: true });
  });

  test('a record shared with the caller makes its collection reachable', async () => {
    await grant('share-b1', forUser(bob.user, 'read', { target_scope: 'record', resource_type: 'book', resource_id: 'b1' }));
    expect(access(bob.user, 'book')).toEqual({ read: true, write: false });
  });

  test('a collection-wide deny beats ownership', async () => {
    await grant('deny-books', {
      ...forUser(alice.user, 'read', { target_scope: 'collection', resource_type: 'book' }),
      effect: 'deny',
    });
    expect(access(alice.user, 'book')).toEqual({ read: false, write: false });
  });

  test('a filtered deny only narrows', async () => {
    await grant('deny-some', {
      ...forUser(alice.user, 'write', {
        target_scope: 'collection',
        resource_type: 'book',
        filter: 'title == "locked"',
      }),
      effect: 'deny',
    });
    expect(access(alice.user, 'book')).toEqual({ read: true, write: true });
  });

  test('grants stay writable: sharing follows the manage-on-target rule', () => {
    expect(access(bob.user, 'access-grant')).toEqual({ read: true, write: true });
    expect(access(bob.user, 'role')).toEqual({ read: false, write: false });
  });

  test('superuser_write collections are read-only to everyone but a superuser', async () => {
    await grant('write-settings', forUser(bob.user, 'write', { target_scope: 'collection', resource_type: 'setting' }));
    expect(access(bob.user, 'setting')).toEqual({ read: true, write: false });
    const admin = await t.engine.authenticateToken(t.adminToken);
    expect(access(admin!, 'setting')).toEqual({ read: true, write: true });
  });
});

describe('inherited collections', () => {
  test('follow the governing ancestor', async () => {
    expect(access(alice.user, 'chapter')).toEqual({ read: true, write: true });
    expect(access(alice.user, 'note')).toEqual({ read: true, write: true });
    expect(access(bob.user, 'chapter')).toEqual({ read: false, write: false });

    await grant('share-b1', forUser(bob.user, 'read', { target_scope: 'record', resource_type: 'book', resource_id: 'b1' }));
    expect(access(bob.user, 'chapter')).toEqual({ read: true, write: false });
    expect(access(bob.user, 'note')).toEqual({ read: true, write: false });
  });

  test('a collection-wide deny on the way down still applies', async () => {
    await grant('deny-chapters', {
      ...forUser(alice.user, 'read', { target_scope: 'collection', resource_type: 'chapter' }),
      effect: 'deny',
    });
    expect(access(alice.user, 'chapter')).toEqual({ read: false, write: false });
    expect(access(alice.user, 'note')).toEqual({ read: false, write: false });
    expect(access(alice.user, 'book')).toEqual({ read: true, write: true });
  });

  test('an independent child answers to its own rows', async () => {
    await grant('share-b1', forUser(bob.user, 'write', { target_scope: 'record', resource_type: 'book', resource_id: 'b1' }));
    expect(access(bob.user, 'chapter')).toEqual({ read: true, write: true });
    expect(access(bob.user, 'review')).toEqual({ read: false, write: false });
  });
});

describe('user subtree and credentials', () => {
  test("a user's own subtree is always theirs", () => {
    expect(access(bob.user, 'bookmark')).toEqual({ read: true, write: true });
  });

  test('a read-only OAuth scope writes nothing', () => {
    const scoped: User = { ...alice.user, oauth: { scope: MCP_SCOPE_READ } };
    expect(access(scoped, 'book')).toEqual({ read: true, write: false });
    expect(access(scoped, 'bookmark')).toEqual({ read: true, write: false });
  });

  test('a PAT reaches only what its own grants do', async () => {
    const secret = generatePatSecret();
    insertToken(t.engine.db, secret, alice.user.id, null, 'pat-books');
    await grant('pat-books-0', {
      subject_type: 'token',
      subject_id: 'pat-books',
      target_scope: 'collection',
      resource_type: 'book',
      capability: 'read',
    });
    const caller = await t.engine.authenticateToken(secret);
    expect(caller?.pat?.id).toBe('pat-books');

    expect(access(caller!, 'book')).toEqual({ read: true, write: false });
    // Reading the governing book reaches its chapters…
    expect(access(caller!, 'chapter')).toEqual({ read: true, write: false });
    // …but the token says nothing about reviews or the owner's bookmarks.
    expect(access(caller!, 'review')).toEqual({ read: false, write: false });
    expect(access(caller!, 'bookmark')).toEqual({ read: false, write: false });
  });

  test('the built-in user root is not reported', () => {
    expect(t.engine.collectionAccess(alice.user).has('user')).toBe(false);
  });
});
