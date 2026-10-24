/**
 * Parent access inheritance (`engine/inherit.ts`): a child record is reachable
 * by whoever may reach its governing ancestor — read to see it, write to add,
 * change, or remove it — and the child row's own owner and allow grants play no
 * part. Denies still narrow on the way down, a PAT passes on either the ancestor
 * or the child type, and a resource can opt out with `independent_access`.
 *
 * Fixture: books (top level) → chapters → notes, plus reviews under books that
 * opt out, and bookmarks under users (the root case, unchanged).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { insertToken } from '../../src/engine/users';
import { generatePatSecret } from '../../src/engine/pat';
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

let t: TestEngine;
let alice: { user: User; token: string };
let bob: { user: User; token: string };

const as = (who: { token: string }) => ({
  get: (path: string) => call(t.engine, 'GET', path, { token: who.token }),
  post: (path: string, body: unknown = { title: 'x' }) => call(t.engine, 'POST', path, { token: who.token, body }),
  patch: (path: string, body: unknown = { title: 'y' }) => call(t.engine, 'PATCH', path, { token: who.token, body }),
  del: (path: string) => call(t.engine, 'DELETE', path, { token: who.token }),
});

async function ids(res: Response): Promise<string[]> {
  expect(res.status).toBe(200);
  return ((await res.json()).results as Array<{ id: string }>).map((r) => r.id).sort();
}

async function grant(id: string, body: Record<string, unknown>): Promise<Response> {
  const res = await call(t.engine, 'POST', `/access-grants?id=${id}`, { token: t.adminToken, body });
  t.engine.reloadPermissions();
  return res;
}

const shareBook = (id: string, user: User, capability: 'read' | 'write', bookId = 'b1') =>
  grant(id, {
    subject_type: 'user',
    subject_id: user.id,
    target_scope: 'record',
    resource_type: 'book',
    resource_id: bookId,
    capability,
  });

async function deleteGrant(id: string): Promise<void> {
  expect((await call(t.engine, 'DELETE', `/access-grants/${id}`, { token: t.adminToken })).status).toBe(204);
  t.engine.reloadPermissions();
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
  for (const def of [BOOK_DEF, CHAPTER_DEF, NOTE_DEF, REVIEW_DEF, BOOKMARK_DEF]) {
    expect((await defineResource(t, def, def.singular)).ok).toBe(true);
  }
  await seedPermissions(BASE, t.adminToken, (input, init) => t.engine.fetch(new Request(input, init)));

  alice = await seedUser(t.engine, { email: 'alice@example.com' });
  bob = await seedUser(t.engine, { email: 'bob@example.com' });

  // Alice builds her library while the open baseline lets her create, then the
  // baseline goes: from here on access is owner + whatever a test grants.
  await installOpenGrant(t);
  const a = as(alice);
  for (const path of [
    '/books?id=b1',
    '/books?id=b2',
    '/books/b1/chapters?id=c1',
    '/books/b1/chapters?id=c2',
    '/books/b2/chapters?id=c9',
    '/books/b1/chapters/c1/notes?id=n1',
    '/books/b1/reviews?id=r1',
  ]) {
    expect((await a.post(path)).status).toBe(201);
  }
  await deleteGrant('open-household');
});

afterEach(() => {
  delete process.env.PERMISSION_CACHE_TTL_MS;
});

describe('children follow their governing ancestor', () => {
  test('the parent’s owner reaches every descendant; a stranger reaches none', async () => {
    const a = as(alice);
    expect((await a.get('/books/b1/chapters/c1')).status).toBe(200);
    expect(await ids(await a.get('/books/b1/chapters'))).toEqual(['c1', 'c2']);
    expect((await a.get('/books/b1/chapters/c1/notes/n1')).status).toBe(200);
    expect((await a.post('/books/b1/chapters?id=c3')).status).toBe(201);

    const b = as(bob);
    expect((await b.get('/books/b1/chapters/c1')).status).toBe(403);
    expect((await b.get('/books/b1/chapters')).status).toBe(403);
    expect((await b.get('/books/b1/chapters/c1/notes/n1')).status).toBe(403);
    expect((await b.get('/books/b1/chapters/c1/notes')).status).toBe(403);
    expect((await b.post('/books/b1/chapters?id=cx')).status).toBe(403);
  });

  test('sharing a record for read shares its whole subtree, read-only', async () => {
    await shareBook('share-b1', bob.user, 'read');
    const b = as(bob);
    expect((await b.get('/books/b1/chapters/c1')).status).toBe(200);
    expect(await ids(await b.get('/books/b1/chapters'))).toEqual(['c1', 'c2']);
    expect((await b.get('/books/b1/chapters/c1/notes/n1')).status).toBe(200);

    expect((await b.post('/books/b1/chapters?id=cx')).status).toBe(403);
    expect((await b.patch('/books/b1/chapters/c1')).status).toBe(403);
    expect((await b.del('/books/b1/chapters/c1')).status).toBe(403);

    // The share names one book; its sibling's subtree stays closed.
    expect((await b.get('/books/b2/chapters')).status).toBe(403);
    expect((await b.get('/books/b2/chapters/c9')).status).toBe(403);
  });

  test('write on the parent lets you add, change, and remove children', async () => {
    await shareBook('share-b1', bob.user, 'write');
    const b = as(bob);
    expect((await b.post('/books/b1/chapters?id=c3')).status).toBe(201);
    expect((await b.post('/books/b1/chapters/c1/notes?id=n2')).status).toBe(201);
    expect((await b.patch('/books/b1/chapters/c1')).status).toBe(200);
    expect((await b.del('/books/b1/chapters/c2')).status).toBe(204);
  });

  test('the parent decides, not the child row’s owner', async () => {
    await shareBook('share-b1', bob.user, 'write');
    expect((await as(bob).post('/books/b1/chapters?id=bobs')).status).toBe(201);

    // Alice owns the book, so she reaches the chapter Bob wrote under it.
    expect((await as(alice).get('/books/b1/chapters/bobs')).status).toBe(200);
    expect((await as(alice).del('/books/b1/chapters/bobs')).status).toBe(204);
    expect((await as(bob).post('/books/b1/chapters?id=bobs2')).status).toBe(201);

    // Revoke the share and Bob loses his own chapter with it.
    await deleteGrant('share-b1');
    expect((await as(bob).get('/books/b1/chapters/bobs2')).status).toBe(403);
  });

  test('the superuser reaches everything (break-glass)', async () => {
    const admin = { token: t.adminToken };
    expect((await as(admin).get('/books/b1/chapters/c1/notes/n1')).status).toBe(200);
    expect(await ids(await as(admin).get('/books/b1/chapters'))).toEqual(['c1', 'c2']);
  });
});

describe('denies still narrow on the way down', () => {
  test('a deny on the child type beats the parent’s allow', async () => {
    await shareBook('share-b1', bob.user, 'read');
    await grant('deny-chapters', {
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'collection',
      resource_type: 'chapter',
      capability: 'read',
      effect: 'deny',
    });
    const b = as(bob);
    expect((await b.get('/books/b1')).status).toBe(200);
    expect((await b.get('/books/b1/chapters/c1')).status).toBe(403);
    expect(await ids(await b.get('/books/b1/chapters'))).toEqual([]);
    // Notes sit beneath the denied type, so the deny covers them too.
    expect((await b.get('/books/b1/chapters/c1/notes/n1')).status).toBe(403);
    expect((await b.get('/books/b1/chapters/c1/notes')).status).toBe(403);
  });

  test('a deny on one child row hides that row and its own children', async () => {
    await shareBook('share-b1', bob.user, 'read');
    expect(
      (
        await grant('deny-c1', {
          subject_type: 'user',
          subject_id: bob.user.id,
          target_scope: 'record',
          resource_type: 'chapter',
          resource_id: 'c1',
          capability: 'read',
          effect: 'deny',
        })
      ).status,
    ).toBe(201);
    const b = as(bob);
    expect(await ids(await b.get('/books/b1/chapters'))).toEqual(['c2']);
    expect((await b.get('/books/b1/chapters/c1')).status).toBe(403);
    expect((await b.get('/books/b1/chapters/c2')).status).toBe(200);
    expect((await b.get('/books/b1/chapters/c1/notes/n1')).status).toBe(403);
    expect((await b.get('/books/b1/chapters/c1/notes')).status).toBe(403);
  });
});

describe('opting out and the user root', () => {
  test('an independent_access child keeps its own owner-and-grant rules', async () => {
    await shareBook('share-b1', bob.user, 'read');
    const b = as(bob);
    // The book is shared, but reviews don't follow it.
    expect((await b.get('/books/b1/reviews/r1')).status).toBe(403);
    expect(await ids(await b.get('/books/b1/reviews'))).toEqual([]);
    expect((await as(alice).get('/books/b1/reviews/r1')).status).toBe(200);
  });

  test('a user subtree stays its owner’s alone, even under a blanket grant', async () => {
    await installOpenGrant(t);
    expect((await as(alice).post(`/users/${alice.user.id}/bookmarks?id=k1`)).status).toBe(201);
    expect((await as(alice).get(`/users/${alice.user.id}/bookmarks/k1`)).status).toBe(200);
    expect((await as(bob).get(`/users/${alice.user.id}/bookmarks/k1`)).status).toBe(403);
    expect((await as(bob).get(`/users/${alice.user.id}/bookmarks`)).status).toBe(403);
  });
});

describe('grants aimed at an inheriting resource', () => {
  test('a record-scope allow on a child is refused, pointing at the parent', async () => {
    const res = await grant('share-c1', {
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'record',
      resource_type: 'chapter',
      resource_id: 'c1',
      capability: 'read',
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/share the book instead/);
    // A grandchild names its governing ancestor, not its direct parent.
    const note = await grant('share-n1', {
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'record',
      resource_type: 'note',
      resource_id: 'n1',
      capability: 'read',
    });
    expect(await note.text()).toMatch(/share the book instead/);
  });

  test('a record-scope deny and a collection-scope grant are still accepted', async () => {
    const deny = await grant('deny-c1', {
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'record',
      resource_type: 'chapter',
      resource_id: 'c1',
      capability: 'read',
      effect: 'deny',
    });
    expect(deny.status).toBe(201);
    const collection = await grant('chapters-read', {
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'collection',
      resource_type: 'chapter',
      capability: 'read',
    });
    expect(collection.status).toBe(201);
    // …but a collection allow on the child type grants nothing by itself:
    // access still comes from the book.
    expect((await as(bob).get('/books/b1/chapters/c2')).status).toBe(403);
  });

  test('an independent child still takes record-scope allows', async () => {
    const res = await grant('share-r1', {
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'record',
      resource_type: 'review',
      resource_id: 'r1',
      capability: 'read',
    });
    expect(res.status).toBe(201);
    expect((await as(bob).get('/books/b1/reviews/r1')).status).toBe(200);
  });
});

describe('personal access tokens', () => {
  async function mintPat(patId: string, grants: Array<Record<string, unknown>>): Promise<string> {
    const secret = generatePatSecret();
    insertToken(t.engine.db, secret, alice.user.id, null, patId);
    for (const [i, g] of grants.entries()) {
      const res = await grant(`${patId}-${i}`, { subject_type: 'token', subject_id: patId, ...g });
      expect(res.status).toBe(201);
    }
    return secret;
  }

  test('a token shared on one record reaches that record’s children', async () => {
    const token = await mintPat('pat-b1', [
      { target_scope: 'record', resource_type: 'book', resource_id: 'b1', capability: 'read' },
    ]);
    const p = as({ token });
    expect((await p.get('/books/b1/chapters/c1')).status).toBe(200);
    expect(await ids(await p.get('/books/b1/chapters'))).toEqual(['c1', 'c2']);
    expect((await p.get('/books/b1/chapters/c1/notes/n1')).status).toBe(200);
    expect((await p.patch('/books/b1/chapters/c1')).status).toBe(403);
    expect((await p.get('/books/b2/chapters/c9')).status).toBe(403);
  });

  test('a token scoped to the child type keeps working', async () => {
    const token = await mintPat('pat-chapters', [
      { target_scope: 'collection', resource_type: 'chapter', capability: 'read' },
    ]);
    const p = as({ token });
    expect((await p.get('/books/b2/chapters/c9')).status).toBe(200);
    expect(await ids(await p.get('/books/b1/chapters'))).toEqual(['c1', 'c2']);
    // …but the grant names chapters, not notes or books.
    expect((await p.get('/books/b1/chapters/c1/notes/n1')).status).toBe(403);
    expect((await p.get('/books/b1')).status).toBe(403);
  });

  test('a token with no grants reaches nothing, even under its owner’s records', async () => {
    const token = await mintPat('pat-none', []);
    expect((await as({ token }).get('/books/b1/chapters/c1')).status).toBe(403);
    expect(await ids(await as({ token }).get('/books/b1/chapters'))).toEqual([]);
  });

  test('a token is still bounded by its owner', async () => {
    const secret = generatePatSecret();
    insertToken(t.engine.db, secret, bob.user.id, null, 'pat-bob');
    await grant('pat-bob-0', {
      subject_type: 'token',
      subject_id: 'pat-bob',
      target_scope: 'collection',
      resource_type: 'chapter',
      capability: 'read',
    });
    // Bob can't read Alice's book, so neither can his token.
    expect((await as({ token: secret }).get('/books/b1/chapters/c1')).status).toBe(403);
  });
});

describe('the change feed’s read check', () => {
  test('follows the parent: no share, no event; share, event', () => {
    expect(t.engine.canRead(bob.user, 'chapter', 'books/b1/chapters/c1')).toBe(false);
    expect(t.engine.canRead(bob.user, 'note', 'books/b1/chapters/c1/notes/n1')).toBe(false);
  });

  test('a share on the parent opens its children to the feed', async () => {
    await shareBook('share-b1', bob.user, 'read');
    expect(t.engine.canRead(bob.user, 'chapter', 'books/b1/chapters/c1')).toBe(true);
    expect(t.engine.canRead(bob.user, 'note', 'books/b1/chapters/c1/notes/n1')).toBe(true);
    expect(t.engine.canRead(bob.user, 'chapter', 'books/b2/chapters/c9')).toBe(false);
  });
});
