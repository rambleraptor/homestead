/**
 * aepbase REST client
 *
 * Thin wrapper exposing `getCollection<T>().getFullList/getOne/create/
 * update/delete`-style ergonomics on top of aepbase. Talks to aepbase
 * via the same-origin `/api/aep` Next.js proxy — clients never address
 * aepbase directly.
 *
 * Behavior worth knowing:
 *  - aepbase list responses use `next_page_token`/`results`. `list()`
 *    follows the cursor automatically and returns a flat array.
 *  - PATCH uses `application/merge-patch+json`. Multipart create/update is
 *    used when the caller passes a `FormData` body.
 *  - Server-side ordering is available via the `orderBy` list option (AEP
 *    `order_by`); without it, results come back in insertion order and a
 *    caller may sort the returned array itself.
 *  - Parented resources are addressed via nested URLs (`{parent}/{children}`)
 *    rather than via filter strings on a foreign-key field.
 *  - User registration is not supported. `login()` is the only auth call.
 */

import { isNativeHomestead, nativeRequest, revokeNativeDeviceOnLogout } from '../mobile/bridge';
import { takeOAuthReturnUrl } from '../auth/oauthReturn';
import type { OAuthSession, User, UserType } from '../auth/types';

const AEP_BASE = '/api/aep';
/** First-party session endpoints (login/refresh/logout) — not under /api/aep. */
const AUTH_BASE = '/api/auth';
const AUTH_TOKEN_KEY = 'aepbase_auth_token';
const AUTH_USER_KEY = 'aepbase_auth_user';
const AUTH_REFRESH_KEY = 'aepbase_refresh_token';
const AUTH_EXPIRES_KEY = 'aepbase_token_expires_at';
/** Renew the access token this many ms before it actually expires. */
const RENEW_SKEW_MS = 30_000;

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/** Error envelope returned by aepbase: `{ error: { code, message } }`. */
export class AepbaseError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'AepbaseError';
  }
}

// ----------------------------------------------------------------------------
// Auth store
// ----------------------------------------------------------------------------

interface RawAepUser {
  id: string;
  path: string;
  email: string;
  display_name?: string;
  type?: string;
  create_time: string;
  update_time: string;
}

/** Map aepbase's `user` resource onto the frontend's `User` view model. */
function mapAepUser(raw: RawAepUser): User {
  const type: UserType | undefined =
    raw.type === 'superuser' || raw.type === 'regular' ? raw.type : undefined;
  return {
    id: raw.id,
    email: raw.email,
    username: raw.email, // aepbase has no username; reuse email
    name: raw.display_name || '',
    verified: true,
    created: raw.create_time,
    updated: raw.update_time,
    type,
  };
}

type AuthChangeListener = (token: string, user: User | null) => void;

/** A freshly-issued session from /api/auth/{login,refresh}. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

class AuthStore {
  private _token: string | null = null;
  private _refreshToken: string | null = null;
  /** Epoch ms at which the access token expires; null = unknown/never. */
  private _expiresAt: number | null = null;
  private _user: User | null = null;
  private listeners = new Set<AuthChangeListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      this._token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      this._refreshToken = window.localStorage.getItem(AUTH_REFRESH_KEY);
      const rawExpires = window.localStorage.getItem(AUTH_EXPIRES_KEY);
      this._expiresAt = rawExpires ? Number(rawExpires) || null : null;
      const rawUser = window.localStorage.getItem(AUTH_USER_KEY);
      if (rawUser) {
        try {
          this._user = JSON.parse(rawUser) as User;
        } catch {
          this._user = null;
        }
      }
    }
  }

  get token(): string {
    return this._token || '';
  }

  get refreshToken(): string {
    return this._refreshToken || '';
  }

  get isValid(): boolean {
    return !!this._token;
  }

  /** True when we hold a refresh token and the access token is near/at expiry. */
  get needsRenewal(): boolean {
    if (!this._token || !this._refreshToken || this._expiresAt === null) return false;
    return Date.now() >= this._expiresAt - RENEW_SKEW_MS;
  }

  /** Callers read `authStore.model` for the current user. */
  get model(): User | null {
    return this._user;
  }

  /**
   * Update the access token and/or user while preserving the refresh token and
   * expiry (used to swap in a hydrated user object after login). Passing an
   * empty token clears everything.
   */
  save(token: string, user: User | null): void {
    if (!token) {
      this.clear();
      return;
    }
    this._token = token;
    this._user = user;
    this.persist();
    this.emit();
  }

  /** Persist a full session (access + refresh + expiry) plus the user. */
  saveSession(session: Session, user: User | null): void {
    this._token = session.accessToken;
    this._refreshToken = session.refreshToken;
    this._expiresAt = Date.now() + session.expiresIn * 1000;
    this._user = user;
    this.persist();
    this.emit();
  }

  clear(): void {
    this._token = null;
    this._refreshToken = null;
    this._expiresAt = null;
    this._user = null;
    this.persist();
    this.emit();
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    const set = (key: string, value: string | null) => {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    };
    set(AUTH_TOKEN_KEY, this._token);
    set(AUTH_REFRESH_KEY, this._refreshToken);
    set(AUTH_EXPIRES_KEY, this._expiresAt !== null ? String(this._expiresAt) : null);
    set(AUTH_USER_KEY, this._user ? JSON.stringify(this._user) : null);
  }

  onChange(listener: AuthChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this._token || '', this._user);
    }
  }
}

export const authStore = new AuthStore();

// ----------------------------------------------------------------------------
// Token refresh (single-flight)
// ----------------------------------------------------------------------------

let refreshInFlight: Promise<boolean> | null = null;

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Exchange the stored refresh token for a fresh session. Returns true on
 * success. A definitive rejection (non-ok response — the refresh token is
 * revoked/expired) clears the session; a network error leaves it intact so a
 * later call can retry.
 */
async function performRefresh(): Promise<boolean> {
  const refreshToken = authStore.refreshToken;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${AUTH_BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      authStore.clear();
      return false;
    }
    const data = (await res.json()) as RefreshResponse;
    authStore.saveSession(
      {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      },
      authStore.model,
    );
    return true;
  } catch {
    return false;
  }
}

/** Refresh the session, de-duplicating concurrent callers onto one request. */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Proactively renew the access token if it is at/near expiry. */
async function ensureFreshToken(): Promise<void> {
  if (authStore.needsRenewal) await refreshSession();
}

// ----------------------------------------------------------------------------
// HTTP core
// ----------------------------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  // When true, send the body as application/merge-patch+json (used by PATCH).
  mergePatch?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, mergePatch } = options;

  let url = `${AEP_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const send = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (authStore.token) {
      headers.Authorization = `Bearer ${authStore.token}`;
    }
    const init: RequestInit = { method, headers };
    if (body instanceof FormData) {
      init.body = body;
      // Let the browser set the multipart boundary.
    } else if (body !== undefined) {
      headers['Content-Type'] = mergePatch
        ? 'application/merge-patch+json'
        : 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(url, init);
  };

  // Renew a near-expired access token before spending it, then send. If the
  // server still rejects the token (401) and we hold a refresh token, refresh
  // once and retry — this is the global handler that keeps a session alive
  // across access-token expiry without the caller noticing.
  await ensureFreshToken();
  let res = await send();
  if (res.status === 401 && authStore.refreshToken && (await refreshSession())) {
    res = await send();
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response — fall through and surface the raw text.
    }
  }

  if (!res.ok) {
    const envelope = parsed as { error?: { code?: number; message?: string } } | undefined;
    const code = envelope?.error?.code ?? res.status;
    const message = envelope?.error?.message ?? text ?? `HTTP ${res.status}`;
    throw new AepbaseError(code, message, url);
  }

  return parsed as T;
}

// ----------------------------------------------------------------------------
// Resource path helpers
// ----------------------------------------------------------------------------

/**
 * Build a list/collection path. `parent` lets callers address nested
 * resources, e.g. `collectionPath('transactions', { parent: ['gift-cards', cardId] })`
 * → `/gift-cards/{cardId}/transactions`.
 */
function collectionPath(plural: string, parent?: ParentPath): string {
  if (!parent) return `/${plural}`;
  // parent comes in as alternating [plural, id, plural, id, ...] segments.
  return `/${parent.join('/')}/${plural}`;
}

function itemPath(plural: string, id: string, parent?: ParentPath): string {
  return `${collectionPath(plural, parent)}/${id}`;
}

/** Alternating [plural, id, plural, id, ...] segments naming the parent chain. */
export type ParentPath = string[];

// ----------------------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------------------

interface ListOptions {
  filter?: string;
  parent?: ParentPath;
  /** Hard cap. The wrapper follows next_page_token until exhausted. */
  maxPageSize?: number;
  /**
   * AEP `order_by`: a comma-separated field list, ascending by default;
   * prefix a field with `-` for descending (e.g. `-create_time`). The engine
   * sorts server-side, so callers no longer need to re-sort the result.
   */
  orderBy?: string;
}

interface ListResponse<T> {
  results?: T[];
  next_page_token?: string;
}

interface ItemOptions {
  parent?: ParentPath;
  /**
   * AEP-135 cascade delete. When true, a DELETE removes the resource *and*
   * its child subtree; without it, deleting a resource that still has
   * children fails with 409. Only meaningful on `remove`.
   */
  force?: boolean;
}

/**
 * Fetch every record in `plural`, following pagination. Pass `orderBy` to have
 * the engine sort server-side (AEP `order_by`); without it, results come back
 * in insertion order and the caller may sort the returned array itself.
 */
export async function list<T>(plural: string, options: ListOptions = {}): Promise<T[]> {
  const { filter, parent, maxPageSize = 100, orderBy } = options;
  const path = collectionPath(plural, parent);
  const out: T[] = [];
  let pageToken: string | undefined;

  do {
    const page = await request<ListResponse<T>>(path, {
      query: {
        max_page_size: maxPageSize,
        page_token: pageToken,
        filter,
        order_by: orderBy,
      },
    });
    if (page.results) out.push(...page.results);
    pageToken = page.next_page_token || undefined;
  } while (pageToken);

  return out;
}

export async function get<T>(plural: string, id: string, options: ItemOptions = {}): Promise<T> {
  return await request<T>(itemPath(plural, id, options.parent));
}

export async function create<T>(
  plural: string,
  body: Record<string, unknown> | FormData,
  options: ItemOptions = {},
): Promise<T> {
  return await request<T>(collectionPath(plural, options.parent), {
    method: 'POST',
    body,
  });
}

/**
 * Partial update via AEP-134's HTTP semantics: RFC 7396 JSON Merge Patch, sent
 * as `application/merge-patch+json`. Only the keys in `body` are touched — omit
 * a field to leave it unchanged, send it as `null` to clear it, and send a
 * partial object to merge into an existing object field. There is no
 * `update_mask` (that is a proto-only FieldMask concept). A `FormData` body
 * (multipart file update) is sent as-is, not as merge-patch.
 */
export async function update<T>(
  plural: string,
  id: string,
  body: Record<string, unknown> | FormData,
  options: ItemOptions = {},
): Promise<T> {
  return await request<T>(itemPath(plural, id, options.parent), {
    method: 'PATCH',
    body,
    mergePatch: !(body instanceof FormData),
  });
}

export async function remove(
  plural: string,
  id: string,
  options: ItemOptions = {},
): Promise<void> {
  await request<void>(itemPath(plural, id, options.parent), {
    method: 'DELETE',
    query: options.force ? { force: 'true' } : undefined,
  });
}

/**
 * Fetch the bytes of a file-field property via aepbase's auto-registered
 * `:download` custom method. Returns a Blob.
 *
 * The download URL aepbase echoes back in the field on read (e.g.
 * `front_image: "http://.../gift-cards/{id}:download?field=front_image"`)
 * is misleading: only the POST form of `:download` works, not GET. So the
 * browser cannot put it directly into an `<img src>` — callers need to
 * blob-URL the result. See `useGiftCardImageUrl` for the consumer pattern.
 */
export async function download(
  plural: string,
  id: string,
  field: string,
  options: ItemOptions = {},
): Promise<Blob> {
  await ensureFreshToken();
  const url = `${AEP_BASE}${itemPath(plural, id, options.parent)}:download`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ field }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const envelope = (await res.json()) as { error?: { message?: string } };
      if (envelope?.error?.message) message = envelope.error.message;
    } catch {
      // not JSON
    }
    throw new AepbaseError(res.status, message, url);
  }
  return await res.blob();
}

// ----------------------------------------------------------------------------
// Custom methods (AEP-136)
// ----------------------------------------------------------------------------

interface CustomMethodOptions {
  /** Addressed record id for an item-target method (`/<plural>/<id>:<verb>`). */
  id?: string;
  /** Parent chain for a nested resource. */
  parent?: ParentPath;
  /** HTTP method. Defaults to POST (AEP-136 custom methods are POST). */
  method?: string;
}

/**
 * Invoke an AEP-136 custom method that lives on a resource, e.g.
 * `customMethod('grocery-items', 'process-image', { image, mimeType })` →
 * `POST /api/aep/grocery-items:process-image`. Pass `options.id` to address a
 * single record (`/<plural>/<id>:<verb>`).
 *
 * Unlike the CRUD helpers, these are served by the sidecar gateway, which
 * authenticates via both the bearer token and an `X-User-Id` header (the id
 * of the token holder) — so we send both here.
 */
export async function customMethod<T>(
  plural: string,
  verb: string,
  body?: unknown,
  options: CustomMethodOptions = {},
): Promise<T> {
  await ensureFreshToken();
  const base = options.id
    ? itemPath(plural, options.id, options.parent)
    : collectionPath(plural, options.parent);
  const url = `${AEP_BASE}${base}:${verb}`;

  const headers: Record<string, string> = {};
  if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`;
  const userId = authStore.model?.id;
  if (userId) headers['X-User-Id'] = userId;

  const init: RequestInit = { method: options.method ?? 'POST', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response — fall through and surface the raw text.
    }
  }
  if (!res.ok) {
    const envelope = parsed as
      | { error?: { code?: number; message?: string } | string; message?: string }
      | undefined;
    const errObj =
      envelope && typeof envelope.error === 'object' ? envelope.error : undefined;
    const code = errObj?.code ?? res.status;
    const message =
      errObj?.message ??
      (typeof envelope?.error === 'string' ? envelope.error : undefined) ??
      envelope?.message ??
      text ??
      `HTTP ${res.status}`;
    throw new AepbaseError(code, message, url);
  }
  return parsed as T;
}

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: RawAepUser;
}

/**
 * Authenticate through the auth service (`POST /api/auth/login`), which
 * exchanges email + password for a short-lived access token plus a refresh
 * token. On success the full session + user are persisted and any `onChange`
 * listeners fire. (The engine's own `/users:login` still exists for the CLI,
 * which wants a long-lived token; the SPA uses this refreshable path.)
 */
export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!res.ok) {
    const envelope = parsed as { error?: string | { message?: string } } | undefined;
    const message =
      (typeof envelope?.error === 'string' ? envelope.error : envelope?.error?.message) ??
      `HTTP ${res.status}`;
    throw new AepbaseError(res.status, message, `${AUTH_BASE}/login`);
  }
  const data = parsed as LoginResponse;
  const user = mapAepUser(data.user);
  authStore.saveSession(
    {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    },
    user,
  );
  return user;
}

/**
 * Clear the session locally and best-effort revoke it server-side
 * (`POST /api/auth/logout`). Synchronous for callers; the revocation is
 * fire-and-forget so a network hiccup never blocks signing out.
 */
export function logout(): void {
  const token = authStore.token;
  authStore.clear();
  if (token && typeof fetch !== 'undefined') {
    void revokeNativeDeviceOnLogout(token).catch(() => {
      // Local native access is still cleared; the token remains visible for manual revocation.
    }).then(() => fetch(`${AUTH_BASE}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })).catch(() => {
      // Local session is already gone; a failed server revoke is non-fatal.
    });
  }
}

/**
 * POST to an authenticated `/api/auth/*` endpoint that returns a fresh session,
 * and swap the new tokens in. The current user is carried across unchanged —
 * these endpoints rotate credentials, not identity.
 */
async function postForNewSession(
  path: string,
  body?: Record<string, unknown>,
): Promise<void> {
  const url = `${AUTH_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authStore.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!res.ok) {
    const envelope = parsed as { error?: string | { message?: string } } | undefined;
    const message =
      (typeof envelope?.error === 'string' ? envelope.error : envelope?.error?.message) ??
      `HTTP ${res.status}`;
    throw new AepbaseError(res.status, message, url);
  }
  const data = parsed as { access_token: string; refresh_token: string; expires_in: number };
  authStore.saveSession(
    {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    },
    authStore.model,
  );
}

/**
 * Change the signed-in user's password (`POST /api/auth/change-password`). The
 * server verifies `currentPassword` before accepting the new one, then revokes
 * every other session and issues this caller a fresh one — which we store, so
 * the current tab stays signed in while other devices are signed out.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await postForNewSession('/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/**
 * Sign out every other device (`POST /api/auth/logout-all`). The current
 * session is replaced with a fresh one rather than dropped, so the tab the user
 * clicked from stays signed in. Personal access tokens are unaffected.
 */
export async function logoutEverywhere(): Promise<void> {
  await postForNewSession('/logout-all');
}

// ----------------------------------------------------------------------------
// OAuth / OIDC login
// ----------------------------------------------------------------------------

/** A login provider advertised by aepbase's `GET /auth/providers`. */
export interface OAuthProvider {
  name: string;
  display_name: string;
}

/**
 * List the OAuth providers aepbase is configured with (`GET /oauth/providers`).
 * Unauthenticated. Returns an empty array when OAuth is disabled or on any
 * error, so callers can render zero buttons without special-casing.
 */
export async function listOAuthProviders(): Promise<OAuthProvider[]> {
  try {
    const res = await request<{ providers?: OAuthProvider[] }>('/oauth/providers');
    return res.providers ?? [];
  } catch {
    return [];
  }
}

/**
 * Begin an OAuth login by navigating the browser to aepbase's `/start`
 * endpoint, which 302-redirects to the provider. This never returns — it
 * replaces the current document. On success the provider → aepbase callback
 * lands back on the SPA's configured success URL (`/auth/callback`).
 */
export async function startOAuth(providerName: string): Promise<void> {
  const path = `${AEP_BASE}/oauth/${encodeURIComponent(providerName)}/start`;
  if (isNativeHomestead()) {
    const session = await nativeRequest<{ access_token: string; refresh_token: string; expires_in: number }>('oauthStart', { path });
    await completeOAuthLogin({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in });
    window.location.assign(takeOAuthReturnUrl() ?? '/dashboard');
    return;
  }
  window.location.href = path;
}

/**
 * Finish an OAuth login. The federated callback handed us the session in the
 * URL fragment; we resolve the user via the `/users/me` whoami endpoint and
 * persist both, mirroring the tail of `login()`. The fetch uses the access
 * token explicitly (rather than the auth store) so we don't emit a transient
 * null-user state before the real user lands. When a refresh token is present
 * the full session is stored (so it renews like a password login); an older
 * server that only returns a bare token still works, just without refresh.
 */
export async function completeOAuthLogin(session: OAuthSession): Promise<User> {
  const { accessToken } = session;
  const url = `${AEP_BASE}/users/me`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const envelope = (await res.json()) as { error?: { message?: string } };
      if (envelope?.error?.message) message = envelope.error.message;
    } catch {
      // not JSON
    }
    throw new AepbaseError(res.status, message, url);
  }
  const raw = (await res.json()) as RawAepUser;
  const user = mapAepUser(raw);
  if (session.refreshToken) {
    authStore.saveSession(
      { accessToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn ?? 0 },
      user,
    );
  } else {
    authStore.save(accessToken, user);
  }
  return user;
}

/** Re-fetch the current user from the server. No-op if not authenticated. */
export async function refreshCurrentUser(): Promise<User | null> {
  if (!authStore.isValid || !authStore.model) return null;
  const raw = await request<RawAepUser>(`/users/${authStore.model.id}`);
  const user = mapAepUser(raw);
  authStore.save(authStore.token, user);
  return user;
}

export function getCurrentUser(): User | null {
  return authStore.model;
}

// ----------------------------------------------------------------------------
// Default export — namespace of operations for hook callers
// ----------------------------------------------------------------------------

export const aepbase = {
  list,
  get,
  create,
  update,
  remove,
  download,
  customMethod,
  login,
  logout,
  changePassword,
  logoutEverywhere,
  refreshCurrentUser,
  getCurrentUser,
  listOAuthProviders,
  startOAuth,
  completeOAuthLogin,
  authStore,
};

export default aepbase;
