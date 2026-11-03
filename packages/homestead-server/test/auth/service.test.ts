/**
 * Stage 1 — auth-service core + engine seam.
 *
 * Covers: session issuance, expiry-aware validation (at the service and, wired
 * through setTokenValidator, at the engine), refresh rotation, revocation, and
 * the non-negotiable regressions — NULL-expiry (leased/legacy) tokens never
 * expire, and the default engine path still works.
 */

import { describe, expect, test } from 'vitest';
import { Database } from '../../src/engine/sqlite';
import { generateId, generateToken, nowRFC3339 } from '../../src/engine/ids';
import {
  createUserTables,
  getUserByToken,
  insertToken,
  insertUser,
} from '../../src/engine/users';
import type { User } from '../../src/engine/types';
import { TYPE_REGULAR, TYPE_SUPERUSER } from '../../src/engine/types';
import { AuthService } from '../../src/auth/service';
import { expiryFromNow } from '../../src/auth/tokens';
import { Engine } from '../../src/engine/engine';
import { call, makeEngine, seedUser } from '../engine/helpers';

function freshDb(): Database {
  const db = new Database(':memory:');
  createUserTables(db);
  return db;
}

function seed(db: Database, type = TYPE_REGULAR): User {
  const id = generateId();
  const now = nowRFC3339();
  const user: User = {
    id,
    path: `users/${id}`,
    email: `${id}@example.com`,
    type,
    create_time: now,
    update_time: now,
  };
  insertUser(db, user, 'x'); // password hash irrelevant to token tests
  return user;
}

describe('AuthService.issueSession + validateAccessToken', () => {
  test('an issued access token resolves to its user', () => {
    const db = freshDb();
    const user = seed(db);
    const auth = new AuthService(db);

    const session = auth.issueSession(user.id);
    expect(session.access_token).toBeTruthy();
    expect(session.refresh_token).toBeTruthy();
    expect(session.expires_in).toBeGreaterThan(0);
    expect(auth.validateAccessToken(session.access_token)?.id).toBe(user.id);
  });

  test('an expired access token is rejected, swept, and its refresh token survives', () => {
    const db = freshDb();
    const user = seed(db);
    // TTL in the past → the token is born expired.
    const auth = new AuthService(db, { accessTokenTtlSeconds: -1 });

    const session = auth.issueSession(user.id);
    expect(auth.validateAccessToken(session.access_token)).toBeNull();
    // The dead access row is swept …
    expect(getUserByToken(db, session.access_token)).toBeNull();
    // … but presenting a stale access token must not end the session: a
    // request that raced the renewal, or a tab that slept past the expiry,
    // still gets to refresh (through a service with a normal access TTL, since
    // this one mints every token born expired).
    const renewed = new AuthService(db).rotateRefresh(session.refresh_token);
    expect(renewed).not.toBeNull();
    expect(auth.validateAccessToken(renewed!.access_token)?.id).toBe(user.id);
  });

  test('a stale access token presented after a rotation cannot revive anything', () => {
    const db = freshDb();
    const user = seed(db);
    const auth = new AuthService(db, { accessTokenTtlSeconds: -1 });

    const first = auth.issueSession(user.id);
    const second = auth.rotateRefresh(first.refresh_token)!;
    // The old access token is gone and the old refresh token is single-use;
    // presenting the old access token again changes nothing for the new pair.
    expect(auth.validateAccessToken(first.access_token)).toBeNull();
    expect(auth.rotateRefresh(first.refresh_token)).toBeNull();
    expect(auth.rotateRefresh(second.refresh_token)).not.toBeNull();
  });

  test('an unknown token resolves to null', () => {
    const db = freshDb();
    const auth = new AuthService(db);
    expect(auth.validateAccessToken('nope')).toBeNull();
  });
});

describe('refresh rotation', () => {
  test('rotateRefresh mints a new session and single-uses the old refresh token', () => {
    const db = freshDb();
    const user = seed(db);
    const auth = new AuthService(db);

    const first = auth.issueSession(user.id);
    const rotated = auth.rotateRefresh(first.refresh_token);
    expect(rotated).not.toBeNull();
    expect(rotated!.access_token).not.toBe(first.access_token);

    // New access token works; old one is revoked; old refresh can't be reused.
    expect(auth.validateAccessToken(rotated!.access_token)?.id).toBe(user.id);
    expect(auth.validateAccessToken(first.access_token)).toBeNull();
    expect(auth.rotateRefresh(first.refresh_token)).toBeNull();
  });

  test('an expired refresh token cannot be rotated', () => {
    const db = freshDb();
    const user = seed(db);
    const auth = new AuthService(db, { refreshTokenTtlSeconds: -1 });
    const session = auth.issueSession(user.id);
    expect(auth.rotateRefresh(session.refresh_token)).toBeNull();
  });
});

describe('revokeSession', () => {
  test('revoking an access token invalidates it and its refresh token', () => {
    const db = freshDb();
    const user = seed(db);
    const auth = new AuthService(db);
    const session = auth.issueSession(user.id);

    auth.revokeSession(session.access_token);
    expect(auth.validateAccessToken(session.access_token)).toBeNull();
    expect(auth.rotateRefresh(session.refresh_token)).toBeNull();
  });
});

describe('regressions: NULL-expiry tokens never expire', () => {
  test('a plain insertToken (no expiry) validates forever', () => {
    const db = freshDb();
    const user = seed(db, TYPE_SUPERUSER);
    const token = generateToken();
    insertToken(db, token, user.id); // NULL expires_at

    // Both the raw lookup and the auth-service validator honor it.
    expect(getUserByToken(db, token)?.id).toBe(user.id);
    expect(new AuthService(db).validateAccessToken(token)?.id).toBe(user.id);
  });

  test('getUserByToken rejects a token whose explicit expiry has passed', () => {
    const db = freshDb();
    const user = seed(db);
    const token = generateToken();
    insertToken(db, token, user.id, expiryFromNow(-10));
    expect(getUserByToken(db, token)).toBeNull();
  });
});

describe('engine seam: setTokenValidator enforces expiry on /api/aep', () => {
  test('expired tokens are 401 and valid tokens pass through the engine', async () => {
    const t = await makeEngine();
    const auth = new AuthService(t.engine.db);
    t.engine.setTokenValidator(auth.validateAccessToken);

    const { user } = await seedUser(t.engine, { email: 'member@example.com' });

    // A freshly issued token authenticates.
    const good = auth.issueSession(user.id);
    const okRes = await call(t.engine, 'GET', '/users/me', { token: good.access_token });
    expect(okRes.status).toBe(200);
    expect(((await okRes.json()) as User).id).toBe(user.id);

    // An expired token is rejected by the engine's auth block.
    const expired = new AuthService(t.engine.db, { accessTokenTtlSeconds: -1 }).issueSession(
      user.id,
    );
    const badRes = await call(t.engine, 'GET', '/users/me', { token: expired.access_token });
    expect(badRes.status).toBe(401);
  });

  test('the default validator (none set) still authenticates plain tokens', async () => {
    // makeEngine seeds an admin with a plain (NULL-expiry) token and sets no
    // validator — the engine falls back to getUserByToken.
    const t = await makeEngine();
    expect(t.engine instanceof Engine).toBe(true);
    const res = await call(t.engine, 'GET', '/users/me', { token: t.adminToken });
    expect(res.status).toBe(200);
  });
});
