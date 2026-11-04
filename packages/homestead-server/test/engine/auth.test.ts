import { beforeEach, describe, expect, test } from 'vitest';
import { call, makeEngine, seedUser, type TestEngine } from './helpers';
import { insertUser } from '../../src/engine/users';
import { generateId, nowRFC3339 } from '../../src/engine/ids';

let t: TestEngine;

beforeEach(async () => {
  t = await makeEngine();
});

describe('login/logout', () => {
  test('login returns {token, user}; token authenticates requests', async () => {
    await seedUser(t.engine, { email: 'u@example.com', password: 'hunter22' });
    const res = await call(t.engine, 'POST', '/users/:login', {
      body: { email: 'u@example.com', password: 'hunter22' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.user.email).toBe('u@example.com');
    expect('password_hash' in body.user).toBe(false);

    const me = await call(t.engine, 'GET', '/users/me', { token: body.token });
    expect((await me.json()).email).toBe('u@example.com');
  });

  test('wrong password and unknown email are indistinguishable 401s', async () => {
    await seedUser(t.engine, { email: 'u@example.com', password: 'right' });
    for (const body of [
      { email: 'u@example.com', password: 'wrong' },
      { email: 'ghost@example.com', password: 'whatever' },
    ]) {
      const res = await call(t.engine, 'POST', '/users/:login', { body });
      expect(res.status).toBe(401);
      expect((await res.json()).error.message).toBe('invalid email or password');
    }
  });

  test('verifies Go-era $2a$ bcrypt hashes (data compatibility)', async () => {
    // Captured from a real Go-aepbase database.
    const goHash = '$2a$10$wZ7QQfAvvcIEYQs1FjtKu.H619HxINskdYlJ1HmiSAoQWslxm0Du2';
    const goPassword = 'f0de83a4c3a091d0fc5a6ddd';
    const id = generateId();
    const now = nowRFC3339();
    insertUser(
      t.engine.db,
      {
        id,
        path: `users/${id}`,
        email: 'go-era@example.com',
        type: 'superuser',
        create_time: now,
        update_time: now,
      },
      goHash,
    );
    const res = await call(t.engine, 'POST', '/users/:login', {
      body: { email: 'go-era@example.com', password: goPassword },
    });
    expect(res.status).toBe(200);
  });

  test('logout revokes the token', async () => {
    const u = await seedUser(t.engine, { email: 'u@example.com' });
    const out = await call(t.engine, 'POST', '/users/:logout', { token: u.token });
    expect(out.status).toBe(200);
    const after = await call(t.engine, 'GET', '/users/me', { token: u.token });
    expect(after.status).toBe(401);
    expect((await after.json()).error.message).toBe('invalid token');
  });
});

describe('user CRUD permissions', () => {
  test('only superusers create/list/delete users', async () => {
    const regular = await seedUser(t.engine, { email: 'reg@example.com' });

    const created = await call(t.engine, 'POST', '/users', {
      token: t.adminToken,
      body: { email: 'new@example.com', password: 'pw123456' },
    });
    expect(created.status).toBe(200);
    const newUser = await created.json();
    expect(newUser.type).toBe('regular');

    const denied = await call(t.engine, 'POST', '/users', {
      token: regular.token,
      body: { email: 'x@example.com', password: 'pw' },
    });
    expect(denied.status).toBe(403);

    const listDenied = await call(t.engine, 'GET', '/users', { token: regular.token });
    expect(listDenied.status).toBe(403);

    const list = await call(t.engine, 'GET', '/users', { token: t.adminToken });
    expect((await list.json()).results.length).toBeGreaterThanOrEqual(3);

    const delDenied = await call(t.engine, 'DELETE', `/users/${newUser.id}`, {
      token: regular.token,
    });
    expect(delDenied.status).toBe(403);

    // User delete returns 200 {} (not 204) — Go parity.
    const del = await call(t.engine, 'DELETE', `/users/${newUser.id}`, {
      token: t.adminToken,
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({});
  });

  test('regular users view/update only themselves; type change is superuser-only', async () => {
    const alice = await seedUser(t.engine, { email: 'alice@example.com' });
    const bob = await seedUser(t.engine, { email: 'bob@example.com' });

    const peek = await call(t.engine, 'GET', `/users/${bob.user.id}`, { token: alice.token });
    expect(peek.status).toBe(403);

    const own = await call(t.engine, 'PATCH', `/users/${alice.user.id}`, {
      token: alice.token,
      body: { display_name: 'Alice' },
    });
    expect((await own.json()).display_name).toBe('Alice');

    const escalate = await call(t.engine, 'PATCH', `/users/${alice.user.id}`, {
      token: alice.token,
      body: { type: 'superuser' },
    });
    expect(escalate.status).toBe(403);

    const promoted = await call(t.engine, 'PATCH', `/users/${alice.user.id}`, {
      token: t.adminToken,
      body: { type: 'superuser' },
    });
    expect((await promoted.json()).type).toBe('superuser');
  });

  test('superuser password reset re-hashes and old password stops working', async () => {
    const u = await seedUser(t.engine, { email: 'u@example.com', password: 'old-password' });
    await call(t.engine, 'PATCH', `/users/${u.user.id}`, {
      token: t.adminToken,
      body: { password: 'new-password' },
    });
    const oldLogin = await call(t.engine, 'POST', '/users/:login', {
      body: { email: 'u@example.com', password: 'old-password' },
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await call(t.engine, 'POST', '/users/:login', {
      body: { email: 'u@example.com', password: 'new-password' },
    });
    expect(newLogin.status).toBe(200);
  });

  // A bearer token proves possession of a session, not knowledge of the
  // password — so it must not be enough to rewrite the password. Self-service
  // goes through /api/auth/change-password, which demands the current one.
  test('a user cannot patch their own password', async () => {
    const u = await seedUser(t.engine, { email: 'self@example.com', password: 'old-password' });
    const res = await call(t.engine, 'PATCH', `/users/${u.user.id}`, {
      token: u.token,
      body: { password: 'attacker-chosen' },
    });
    expect(res.status).toBe(403);

    // The old password still works — the patch changed nothing.
    const stillOld = await call(t.engine, 'POST', '/users/:login', {
      body: { email: 'self@example.com', password: 'old-password' },
    });
    expect(stillOld.status).toBe(200);
  });

  test('an administrative password reset revokes the target user sessions', async () => {
    const u = await seedUser(t.engine, { email: 'kick@example.com', password: 'old-password' });
    // The seeded session works before the reset.
    const before = await call(t.engine, 'GET', '/users/me', { token: u.token });
    expect(before.status).toBe(200);

    await call(t.engine, 'PATCH', `/users/${u.user.id}`, {
      token: t.adminToken,
      body: { password: 'new-password' },
    });

    const after = await call(t.engine, 'GET', '/users/me', { token: u.token });
    expect(after.status).toBe(401);
  });

  test('password writes are policy-checked on create and update', async () => {
    const short = await call(t.engine, 'POST', '/users', {
      token: t.adminToken,
      body: { email: 'short@example.com', password: 'sh0rt' },
    });
    expect(short.status).toBe(400);

    const u = await seedUser(t.engine, { email: 'policy@example.com', password: 'old-password' });
    const patched = await call(t.engine, 'PATCH', `/users/${u.user.id}`, {
      token: t.adminToken,
      body: { password: 'sh0rt' },
    });
    expect(patched.status).toBe(400);
  });
});

describe('oauth routes without any provider configured', () => {
  test('GET /oauth/providers answers an empty list rather than 404', async () => {
    // The login page asks for this on every visit: "none configured" has to
    // be distinguishable from "couldn't reach the server".
    const res = await call(t.engine, 'GET', '/oauth/providers');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [] });
  });

  test('other /oauth paths stay 404', async () => {
    const res = await call(t.engine, 'GET', '/oauth/google/start');
    expect(res.status).toBe(404);
  });
});
