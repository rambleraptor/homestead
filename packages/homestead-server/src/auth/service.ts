/**
 * The Homestead auth service. Owns the token lifecycle — issuing sessions
 * (access + refresh), validating access tokens (expiry-aware, with revocation
 * of dead rows), rotating refresh tokens, and revoking sessions. Access tokens
 * are ordinary engine tokens (rows in `_tokens`), so the engine keeps
 * validating them; this service adds expiry and refresh on top and is wired
 * into the engine via `engine.setTokenValidator`.
 *
 * Every issuance path (password login, federated callback, OAuth `/token`)
 * funnels through {@link AuthService.issueSession}, so there is one place that
 * mints a session.
 */

import type { Database } from '../engine/sqlite';
import { generateToken } from '../engine/ids';
import type { User } from '../engine/types';
import {
  deleteToken,
  getTokenRecord,
  getUserById,
  insertToken,
} from '../engine/users';
import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  expiryFromNow,
  isExpired,
} from './tokens';
import {
  createAuthTables,
  deleteAccessTokenBinding,
  deleteRefreshToken,
  deleteRefreshTokensForAccess,
  getRefreshToken,
  insertAccessTokenBinding,
  insertRefreshToken,
} from './storage';

export interface AuthServiceOptions {
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
}

/** Optional binding metadata carried on the issued tokens (used from Stage 3). */
export interface SessionContext {
  clientId?: string | null;
  scope?: string | null;
  audience?: string | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Access-token lifetime in seconds (the OAuth `expires_in`). */
  expires_in: number;
  scope: string | null;
}

export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly db: Database,
    opts: AuthServiceOptions = {},
  ) {
    this.accessTtl = opts.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    this.refreshTtl = opts.refreshTokenTtlSeconds ?? DEFAULT_REFRESH_TOKEN_TTL_SECONDS;
    createAuthTables(this.db);
  }

  /** Mint an access + refresh token pair for a user. */
  issueSession(userId: string, ctx: SessionContext = {}): Session {
    const accessToken = generateToken();
    insertToken(this.db, accessToken, userId, expiryFromNow(this.accessTtl));
    insertAccessTokenBinding(this.db, {
      access_token: accessToken,
      user_id: userId,
      client_id: ctx.clientId ?? null,
      scope: ctx.scope ?? null,
      audience: ctx.audience ?? null,
    });

    const refreshToken = generateToken();
    insertRefreshToken(this.db, {
      refresh_token: refreshToken,
      access_token: accessToken,
      user_id: userId,
      client_id: ctx.clientId ?? null,
      scope: ctx.scope ?? null,
      audience: ctx.audience ?? null,
      expires_at: expiryFromNow(this.refreshTtl),
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: this.accessTtl,
      scope: ctx.scope ?? null,
    };
  }

  /**
   * Resolve an access token to its user, or null if it is unknown or expired.
   * An expired access token is deleted on the way out so dead rows don't
   * accumulate — but its refresh token is left alone. Presenting an expired
   * access token is routine client behaviour (a request racing the renewal,
   * a tab that was asleep past the expiry, clock skew), not a reason to end
   * the session; the refresh token has its own expiry and is single-use, and
   * `rotateRefresh` is what retires it. Wire this into
   * `engine.setTokenValidator`.
   */
  validateAccessToken = (token: string): User | null => {
    const rec = getTokenRecord(this.db, token);
    if (!rec) return null;
    if (isExpired(rec.expires_at)) {
      deleteToken(this.db, token);
      deleteAccessTokenBinding(this.db, token);
      return null;
    }
    const user = getUserById(this.db, rec.user_id)?.user ?? null;
    // Carry the PAT link through so enforcement attenuates the caller to the
    // token's assigned grants. Ordinary sessions have a null pat_id.
    if (user && rec.pat_id) user.pat = { id: rec.pat_id };
    return user;
  };

  /**
   * Exchange a refresh token for a fresh session, rotating the refresh token
   * (single-use). Returns null when the refresh token is unknown or expired.
   * The old access + refresh tokens are revoked.
   */
  rotateRefresh(refreshToken: string): Session | null {
    const rec = getRefreshToken(this.db, refreshToken);
    if (!rec) return null;
    if (isExpired(rec.expires_at)) {
      deleteRefreshToken(this.db, refreshToken);
      deleteToken(this.db, rec.access_token);
      deleteAccessTokenBinding(this.db, rec.access_token);
      return null;
    }
    // Revoke the old pair before minting the new one (rotation).
    deleteRefreshToken(this.db, refreshToken);
    deleteToken(this.db, rec.access_token);
    deleteAccessTokenBinding(this.db, rec.access_token);
    return this.issueSession(rec.user_id, {
      clientId: rec.client_id,
      scope: rec.scope,
      audience: rec.audience,
    });
  }

  /** Revoke a session by its access token (drops the access + refresh tokens). */
  revokeSession(accessToken: string): void {
    deleteToken(this.db, accessToken);
    deleteRefreshTokensForAccess(this.db, accessToken);
    deleteAccessTokenBinding(this.db, accessToken);
  }
}
