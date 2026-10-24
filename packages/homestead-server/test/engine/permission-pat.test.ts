/**
 * Personal access token (PAT) enforcement. A PAT authenticates as its owner but
 * its authority is the *intersection* of the grants assigned to the token
 * (subject_type = 'token') with the owner's own access — so a token can never do
 * more than its owner, and a token with no grants is inert. Superuser break-glass
 * is suppressed on the token side.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { insertToken } from '../../src/engine/users';
import { generatePatSecret } from '../../src/engine/pat';
import { BOOK_DEF, installOpenGrant, call, defineResource, makeEngine, seedUser, type TestEngine } from './helpers';

const BASE = 'http://localhost:8090';

interface ScopeInput {
  capability: 'read' | 'write' | 'manage';
  target_scope: 'all' | 'app' | 'collection';
  resource_type?: string;
  target_app?: string;
  effect?: 'allow' | 'deny';
}

describe('personal access token enforcement', () => {
  let t: TestEngine;

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
    await defineResource(t, BOOK_DEF);
    await seedPermissions(BASE, t.adminToken, (input: string, init?: RequestInit) =>
      t.engine.fetch(new Request(input, init)),
    );
    // Seeding writes no grants; these tests narrow from an open baseline.
    await installOpenGrant(t);
  });

  afterEach(() => {
    delete process.env.PERMISSION_CACHE_TTL_MS;
  });

  /** Mint a PAT for `userId`: a _tokens row (hashed at rest) plus one grant per scope. */
  async function mintPat(userId: string, patId: string, scopes: ScopeInput[]): Promise<string> {
    const secret = generatePatSecret();
    // insertToken hashes at rest; pass the raw secret, present it as a bearer.
    insertToken(t.engine.db, secret, userId, null, patId);
    for (const s of scopes) {
      const res = await call(t.engine, 'POST', '/access-grants', {
        token: t.adminToken,
        body: {
          subject_type: 'token',
          subject_id: patId,
          capability: s.capability,
          effect: s.effect ?? 'allow',
          target_scope: s.target_scope,
          resource_type: s.resource_type,
          target_app: s.target_app,
        },
      });
      expect(res.status).toBe(201);
    }
    return secret;
  }

  async function deleteOpenGrant(): Promise<void> {
    const res = await call(t.engine, 'DELETE', '/access-grants/open-household', {
      token: t.adminToken,
    });
    expect(res.status).toBe(204);
  }

  test('a read-scoped token can read but not write its owner’s records', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    expect(
      (await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } })).status,
    ).toBe(201);
    await deleteOpenGrant();

    const pat = await mintPat(alice.user.id, 'pat-read', [
      { capability: 'read', target_scope: 'collection', resource_type: 'book' },
    ]);

    expect((await call(t.engine, 'GET', '/books/b1', { token: pat })).status).toBe(200);
    expect(
      (await call(t.engine, 'PATCH', '/books/b1', { token: pat, body: { title: 'A2' } })).status,
    ).toBe(403);
  });

  test('a token with no grants is inert — even for the owner’s own rows', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    // Open grant still present: alice herself has full access, but the token doesn't.
    expect(
      (await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } })).status,
    ).toBe(201);

    const pat = await mintPat(alice.user.id, 'pat-empty', []);

    expect((await call(t.engine, 'GET', '/books/b1', { token: pat })).status).toBe(403);
    const list = await call(t.engine, 'GET', '/books', { token: pat });
    expect((await list.json()).results).toHaveLength(0);
  });

  test('a token cannot exceed its owner: a granted scope is still capped by owner access', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });
    expect(
      (await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } })).status,
    ).toBe(201);
    await deleteOpenGrant();

    // Bob's token is granted read on books, but Bob has no access to Alice's row,
    // so the intersection still denies.
    const pat = await mintPat(bob.user.id, 'pat-bob', [
      { capability: 'read', target_scope: 'collection', resource_type: 'book' },
    ]);
    expect((await call(t.engine, 'GET', '/books/b1', { token: pat })).status).toBe(403);
  });

  test('a superuser’s PAT is constrained to its scopes (break-glass suppressed)', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    await call(t.engine, 'POST', '/books?id=b1', { token: alice.token, body: { title: 'A' } });

    // Admin is a superuser, but a read-only PAT of theirs must stay read-only.
    const pat = await mintPat(t.admin.id, 'pat-admin', [
      { capability: 'read', target_scope: 'collection', resource_type: 'book' },
    ]);
    expect((await call(t.engine, 'GET', '/books/b1', { token: pat })).status).toBe(200);
    expect(
      (await call(t.engine, 'PATCH', '/books/b1', { token: pat, body: { title: 'X' } })).status,
    ).toBe(403);

    // And a grantless superuser PAT sees nothing.
    const empty = await mintPat(t.admin.id, 'pat-admin-empty', []);
    expect((await call(t.engine, 'GET', '/books/b1', { token: empty })).status).toBe(403);
  });

  test('the public grants API rejects a regular user hand-writing a token-subject grant', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const res = await call(t.engine, 'POST', '/access-grants', {
      token: alice.token,
      body: {
        subject_type: 'token',
        subject_id: 'pat-x',
        capability: 'manage',
        target_scope: 'all',
      },
    });
    expect(res.status).toBe(403);
  });
});
