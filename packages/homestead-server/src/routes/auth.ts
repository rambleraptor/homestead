/**
 * First-party session auth:
 * `POST /api/auth/{login,refresh,logout,change-password,logout-all}`.
 *
 * This is the SPA's login path. Unlike the engine's `/users:login` (which the
 * CLI uses and which mints a 30-day token with no refresh), these routes go through the
 * auth service, so the SPA gets a short-lived access token plus a refresh
 * token it can rotate. Access tokens are ordinary engine tokens, so every
 * other `/api/aep` call keeps working with the returned `access_token`.
 *
 * `change-password` lives here rather than on `PATCH /users/{id}` because it is
 * the one password write that proves the caller knows the *current* password —
 * the engine's user PATCH is superuser-only for exactly that reason.
 */

import { Hono } from 'hono';
import type { Database } from '../engine/sqlite';
import { nowRFC3339 } from '../engine/ids';
import { loginThrottleFor, throttledMessage } from '../engine/login-throttle';
import { hashPassword, validatePassword, verifyPasswordDummy } from '../engine/password';
import {
  extractBearerToken,
  getUserByEmail,
  getUserById,
  revokeUserSessions,
  verifyPassword,
} from '../engine/users';
import type { AuthService } from '../auth/service';

interface PublicUser {
  id: string;
  email: string;
  display_name?: string;
  type: string;
}

function toPublicUser(u: {
  id: string;
  email: string;
  display_name?: string;
  type: string;
}): PublicUser {
  return { id: u.id, email: u.email, display_name: u.display_name, type: u.type };
}

export function makeAuthRoutes(db: Database, auth: AuthService): Hono {
  const app = new Hono();

  app.post('/login', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      email?: string;
      password?: string;
    } | null;
    const email = body?.email?.trim();
    const password = body?.password;
    if (!email || !password) {
      return c.json({ error: 'email and password are required' }, 400);
    }

    const throttle = loginThrottleFor(db);
    const retryAfter = throttle.retryAfterSeconds(email);
    if (retryAfter > 0) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: throttledMessage(retryAfter) }, 429);
    }

    const found = getUserByEmail(db, email);
    // Same generic message whether the email is unknown or the password is
    // wrong. An unknown address still pays for a bcrypt verification (against a
    // throwaway hash) so the two cases cost the same — short-circuiting here
    // would make response time a reliable account-enumeration oracle.
    const ok = found
      ? await verifyPassword(password, found.hash)
      : await verifyPasswordDummy(password);
    if (!ok || !found) {
      throttle.recordFailure(email);
      return c.json({ error: 'invalid email or password' }, 401);
    }
    throttle.recordSuccess(email);

    const session = auth.issueSession(found.user.id);
    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      user: toPublicUser(found.user),
    });
  });

  app.post('/refresh', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { refresh_token?: string } | null;
    const refreshToken = body?.refresh_token;
    if (!refreshToken) {
      return c.json({ error: 'refresh_token is required' }, 400);
    }
    const session = auth.rotateRefresh(refreshToken);
    if (!session) {
      return c.json({ error: 'invalid or expired refresh token' }, 401);
    }
    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    });
  });

  app.post('/logout', (c) => {
    // Revoke whatever access token is presented (and its refresh token). Not
    // gated on validity: logging out with an already-dead token is a no-op.
    const token = extractBearerToken(c.req.raw);
    if (token) auth.revokeSession(token);
    return c.json({});
  });

  /**
   * Change the signed-in user's own password, proving they know the current
   * one. On success every existing session is revoked — including sessions on
   * other devices, and any session an attacker holds — and the caller is handed
   * a fresh one so the tab they're using stays signed in.
   */
  app.post('/change-password', async (c) => {
    const token = extractBearerToken(c.req.raw);
    const caller = token ? auth.validateAccessToken(token) : null;
    if (!caller) return c.json({ error: 'authentication required' }, 401);
    // A PAT is a scoped automation credential, not a person at a keyboard;
    // it must not be usable to rewrite the account's password.
    if (caller.pat) {
      return c.json({ error: 'a personal access token cannot change a password' }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as {
      current_password?: string;
      new_password?: string;
    } | null;
    const currentPassword = body?.current_password;
    const newPassword = body?.new_password;
    if (!currentPassword || !newPassword) {
      return c.json({ error: 'current_password and new_password are required' }, 400);
    }

    const found = getUserById(db, caller.id);
    if (!found) return c.json({ error: 'authentication required' }, 401);
    // Fails closed for a federated-only account, whose stored hash is a
    // sentinel no password can match.
    if (!(await verifyPassword(currentPassword, found.hash))) {
      return c.json({ error: 'current password is incorrect' }, 401);
    }

    const check = validatePassword(newPassword);
    if (!check.ok) return c.json({ error: check.error }, 400);
    if (newPassword === currentPassword) {
      return c.json({ error: 'new password must be different from the current password' }, 400);
    }

    db.query('UPDATE _users SET password_hash = ?, update_time = ? WHERE id = ?').run(
      await hashPassword(check.password),
      nowRFC3339(),
      caller.id,
    );
    revokeUserSessions(db, caller.id);

    const session = auth.issueSession(caller.id);
    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    });
  });

  /**
   * Sign out everywhere: drop every session the user holds, then re-issue one
   * for this caller so the current device stays signed in. Personal access
   * tokens are untouched — they're separate credentials with their own
   * revocation UI (see `revokeUserSessions`).
   */
  app.post('/logout-all', (c) => {
    const token = extractBearerToken(c.req.raw);
    const caller = token ? auth.validateAccessToken(token) : null;
    if (!caller) return c.json({ error: 'authentication required' }, 401);
    if (caller.pat) {
      return c.json({ error: 'a personal access token cannot revoke sessions' }, 403);
    }

    revokeUserSessions(db, caller.id);
    const session = auth.issueSession(caller.id);
    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    });
  });

  return app;
}
