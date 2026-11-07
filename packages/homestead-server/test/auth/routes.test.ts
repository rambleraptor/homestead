/**
 * Stage 2 — first-party session routes (/api/auth/{login,refresh,logout}).
 * Drives the Hono route group against a real in-memory engine db + AuthService.
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { Database } from '../../src/engine/sqlite';
import { generateId, nowRFC3339 } from '../../src/engine/ids';
import { createUserTables, hashPassword, insertUser } from '../../src/engine/users';
import { LOGIN_MAX_FAILURES, loginThrottleFor } from '../../src/engine/login-throttle';
import type { User } from '../../src/engine/types';
import { TYPE_REGULAR } from '../../src/engine/types';
import { AuthService } from '../../src/auth/service';
import { makeAuthRoutes } from '../../src/routes/auth';

const PASSWORD = 'correct horse battery';

interface Harness {
  db: Database;
  app: Hono;
  auth: AuthService;
  user: User;
}

async function harness(): Promise<Harness> {
  const db = new Database(':memory:');
  createUserTables(db);
  const auth = new AuthService(db);
  const app = new Hono();
  app.route('/api/auth', makeAuthRoutes(db, auth));

  const id = generateId();
  const now = nowRFC3339();
  const user: User = {
    id,
    path: `users/${id}`,
    email: 'member@example.com',
    type: TYPE_REGULAR,
    create_time: now,
    update_time: now,
  };
  insertUser(db, user, await hashPassword(PASSWORD));
  return { db, app, auth, user };
}

function post(app: Hono, path: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return Promise.resolve(
    app.request(path, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe('POST /api/auth/login', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  test('valid credentials return a session that validates', async () => {
    const res = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: { id: string; email: string };
    };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.user.email).toBe('member@example.com');
    expect(h.auth.validateAccessToken(body.access_token)?.id).toBe(h.user.id);
  });

  test('repeated failures lock the email out, even for the right password', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      const res = await post(h.app, '/api/auth/login', {
        email: 'member@example.com',
        password: 'wrong password',
      });
      expect(res.status).toBe(401);
    }
    const locked = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: PASSWORD,
    });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(((await locked.json()) as { error: string }).error).toMatch(/too many failed/);
  });

  test('failures counted at the other login door count here too', async () => {
    // `/users/:login` records into the same per-database throttle.
    const throttle = loginThrottleFor(h.db);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) throttle.recordFailure('Member@Example.com');
    const res = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: PASSWORD,
    });
    expect(res.status).toBe(429);
  });

  test('a wrong password is 401', async () => {
    const res = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: 'nope',
    });
    expect(res.status).toBe(401);
  });

  test('an unknown email is 401 (same message as a wrong password)', async () => {
    const res = await post(h.app, '/api/auth/login', {
      email: 'ghost@example.com',
      password: PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  test('missing fields are 400', async () => {
    const res = await post(h.app, '/api/auth/login', { email: 'member@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  test('rotates the session and single-uses the old refresh token', async () => {
    const h = await harness();
    const login = (await (
      await post(h.app, '/api/auth/login', { email: 'member@example.com', password: PASSWORD })
    ).json()) as { access_token: string; refresh_token: string };

    const res = await post(h.app, '/api/auth/refresh', { refresh_token: login.refresh_token });
    expect(res.status).toBe(200);
    const rotated = (await res.json()) as { access_token: string; refresh_token: string };
    expect(rotated.access_token).not.toBe(login.access_token);

    // New token works; old access token is revoked; old refresh can't be reused.
    expect(h.auth.validateAccessToken(rotated.access_token)?.id).toBe(h.user.id);
    expect(h.auth.validateAccessToken(login.access_token)).toBeNull();
    const reuse = await post(h.app, '/api/auth/refresh', { refresh_token: login.refresh_token });
    expect(reuse.status).toBe(401);
  });

  test('an unknown refresh token is 401', async () => {
    const h = await harness();
    const res = await post(h.app, '/api/auth/refresh', { refresh_token: 'bogus' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('revokes the presented access token and its refresh token', async () => {
    const h = await harness();
    const login = (await (
      await post(h.app, '/api/auth/login', { email: 'member@example.com', password: PASSWORD })
    ).json()) as { access_token: string; refresh_token: string };

    const res = await post(h.app, '/api/auth/logout', undefined, login.access_token);
    expect(res.status).toBe(200);
    expect(h.auth.validateAccessToken(login.access_token)).toBeNull();
    const reuse = await post(h.app, '/api/auth/refresh', { refresh_token: login.refresh_token });
    expect(reuse.status).toBe(401);
  });
});

/** Sign in and return the fresh session. */
async function signIn(h: Harness): Promise<Session> {
  const res = await post(h.app, '/api/auth/login', {
    email: 'member@example.com',
    password: PASSWORD,
  });
  return (await res.json()) as Session;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const NEW_PASSWORD = 'a different battery staple';

describe('POST /api/auth/change-password', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  test('changes the password when the current one is correct', async () => {
    const session = await signIn(h);
    const res = await post(
      h.app,
      '/api/auth/change-password',
      { current_password: PASSWORD, new_password: NEW_PASSWORD },
      session.access_token,
    );
    expect(res.status).toBe(200);

    // The old password no longer signs in; the new one does.
    const old = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: PASSWORD,
    });
    expect(old.status).toBe(401);
    const fresh = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: NEW_PASSWORD,
    });
    expect(fresh.status).toBe(200);
  });

  test('returns a working session so the caller stays signed in', async () => {
    const session = await signIn(h);
    const res = await post(
      h.app,
      '/api/auth/change-password',
      { current_password: PASSWORD, new_password: NEW_PASSWORD },
      session.access_token,
    );
    const rotated = (await res.json()) as Session;
    expect(rotated.access_token).not.toBe(session.access_token);
    expect(h.auth.validateAccessToken(rotated.access_token)?.id).toBe(h.user.id);
  });

  test('revokes every other session, including one an attacker holds', async () => {
    const victim = await signIn(h);
    const attacker = await signIn(h);

    const res = await post(
      h.app,
      '/api/auth/change-password',
      { current_password: PASSWORD, new_password: NEW_PASSWORD },
      victim.access_token,
    );
    expect(res.status).toBe(200);

    // Both pre-change access tokens are dead, and neither refresh token works.
    expect(h.auth.validateAccessToken(attacker.access_token)).toBeNull();
    expect(h.auth.validateAccessToken(victim.access_token)).toBeNull();
    const reuse = await post(h.app, '/api/auth/refresh', {
      refresh_token: attacker.refresh_token,
    });
    expect(reuse.status).toBe(401);
  });

  test('a wrong current password is 401 and changes nothing', async () => {
    const session = await signIn(h);
    const res = await post(
      h.app,
      '/api/auth/change-password',
      { current_password: 'not the password', new_password: NEW_PASSWORD },
      session.access_token,
    );
    expect(res.status).toBe(401);

    // The session survives and the original password still works.
    expect(h.auth.validateAccessToken(session.access_token)?.id).toBe(h.user.id);
    const still = await post(h.app, '/api/auth/login', {
      email: 'member@example.com',
      password: PASSWORD,
    });
    expect(still.status).toBe(200);
  });

  test('a new password that fails the policy is 400', async () => {
    const session = await signIn(h);
    const res = await post(
      h.app,
      '/api/auth/change-password',
      { current_password: PASSWORD, new_password: 'sh0rt' },
      session.access_token,
    );
    expect(res.status).toBe(400);
  });

  test('reusing the current password as the new one is 400', async () => {
    const session = await signIn(h);
    const res = await post(
      h.app,
      '/api/auth/change-password',
      { current_password: PASSWORD, new_password: PASSWORD },
      session.access_token,
    );
    expect(res.status).toBe(400);
  });

  test('without a token it is 401', async () => {
    const res = await post(h.app, '/api/auth/change-password', {
      current_password: PASSWORD,
      new_password: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout-all', () => {
  test('revokes other sessions and keeps the caller signed in', async () => {
    const h = await harness();
    const phone = await signIn(h);
    const laptop = await signIn(h);

    const res = await post(h.app, '/api/auth/logout-all', undefined, laptop.access_token);
    expect(res.status).toBe(200);
    const rotated = (await res.json()) as Session;

    // The other device is signed out; this one carries on with a new token.
    expect(h.auth.validateAccessToken(phone.access_token)).toBeNull();
    expect(h.auth.validateAccessToken(laptop.access_token)).toBeNull();
    expect(h.auth.validateAccessToken(rotated.access_token)?.id).toBe(h.user.id);
  });

  test('without a token it is 401', async () => {
    const h = await harness();
    const res = await post(h.app, '/api/auth/logout-all');
    expect(res.status).toBe(401);
  });
});
