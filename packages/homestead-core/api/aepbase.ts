/**
 * aepbase REST client
 *
 * Thin wrapper that mirrors the ergonomics of the existing PocketBase client
 * (`getCollection<T>().getFullList/getOne/create/update/delete`) so module
 * hooks can be migrated one at a time. Talks to aepbase via the same-origin
 * `/api/aep` Next.js proxy — clients never address aepbase directly.
 *
 * Differences from PocketBase, called out where they affect callers:
 *  - aepbase list responses use `next_page_token`/`results`, not PB's
 *    `page/perPage/totalItems`. `list()` follows the cursor automatically and
 *    returns a flat array.
 *  - PATCH uses `application/merge-patch+json`. Multipart create/update is
 *    used when the caller passes a `FormData` body.
 *  - There is no `sort` query param. Callers that need ordering must sort
 *    client-side (gift-card-style lists are small enough that this is fine).
 *  - Parented resources are addressed via nested URLs (`{parent}/{children}`)
 *    rather than via filter strings on a foreign-key field.
 *  - User registration is not supported. `login()` is the only auth call.
 */

import type { User, UserType } from '../auth/types';

const AEP_BASE = '/api/aep';
const AUTH_TOKEN_KEY = 'aepbase_auth_token';
const AUTH_USER_KEY = 'aepbase_auth_user';

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
// Auth store (PocketBase-shaped, so AuthContext changes are minimal)
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

class AuthStore {
  private _token: string | null = null;
  private _user: User | null = null;
  private listeners = new Set<AuthChangeListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      this._token = window.localStorage.getItem(AUTH_TOKEN_KEY);
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

  get isValid(): boolean {
    return !!this._token;
  }

  /** PocketBase parity: callers read `authStore.model` for the current user. */
  get model(): User | null {
    return this._user;
  }

  save(token: string, user: User | null): void {
    this._token = token;
    this._user = user;
    if (typeof window !== 'undefined') {
      if (token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      if (user) {
        window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(AUTH_USER_KEY);
      }
    }
    this.emit();
  }

  clear(): void {
    this.save('', null);
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

  const res = await fetch(url, init);

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
}

interface ListResponse<T> {
  results?: T[];
  next_page_token?: string;
}

interface ItemOptions {
  parent?: ParentPath;
}

/**
 * Fetch every record in `plural`, following pagination. aepbase has no sort
 * param — callers that need ordering should sort the returned array client-
 * side.
 */
export async function list<T>(plural: string, options: ListOptions = {}): Promise<T[]> {
  const { filter, parent, maxPageSize = 100 } = options;
  const path = collectionPath(plural, parent);
  const out: T[] = [];
  let pageToken: string | undefined;

  do {
    const page = await request<ListResponse<T>>(path, {
      query: {
        max_page_size: maxPageSize,
        page_token: pageToken,
        filter,
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
  await request<void>(itemPath(plural, id, options.parent), { method: 'DELETE' });
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
// Auth
// ----------------------------------------------------------------------------

interface LoginResponse {
  token: string;
  user: RawAepUser;
}

/**
 * Authenticate against aepbase. The only unauthenticated endpoint —
 * `POST /users/:login` — exchanges email + password for a Bearer token.
 * On success the token + user are persisted in the auth store and any
 * `onChange` listeners fire.
 */
export async function login(email: string, password: string): Promise<User> {
  const res = await request<LoginResponse>('/users/:login', {
    method: 'POST',
    body: { email, password },
  });
  const user = mapAepUser(res.user);
  authStore.save(res.token, user);
  return user;
}

/** Clear the in-memory + persisted token. */
export function logout(): void {
  authStore.clear();
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
// Kebab-case collection name constants (URL paths)
// ----------------------------------------------------------------------------

/**
 * Plural names as they appear in aepbase URL paths. Mirror PB `Collections`
 * but kebab-case to match aepbase's resource definitions. Hooks should import
 * from here so renaming is centralized.
 */
export const AepCollections = {
  USERS: 'users',
  // child of users; URL segment is `preferences`, not `user-preferences`
  USER_PREFERENCES: 'preferences',
  GIFT_CARDS: 'gift-cards',
  GIFT_CARD_TRANSACTIONS: 'transactions', // child of gift-cards
  PEOPLE: 'people',
  PERSON_SHARED_DATA: 'person-shared-data',
  ADDRESSES: 'addresses',
  // notifications + subscriptions are children of users — no top-level form.
  // Always pass `parent: ['users', userId]`.
  NOTIFICATIONS: 'notifications',
  NOTIFICATION_SUBSCRIPTIONS: 'notification-subscriptions',
  GROCERIES: 'groceries',
  STORES: 'stores',
  HSA_RECEIPTS: 'hsa-receipts',
  CREDIT_CARDS: 'credit-cards',
  CREDIT_CARD_PERKS: 'perks', // child of credit-cards
  PERK_REDEMPTIONS: 'redemptions', // child of perks
  RECIPES: 'recipes',
  RECIPE_LOGS: 'logs', // child of recipes
  GAMES: 'games',
  GAME_HOLES: 'holes', // child of games
  PICTIONARY_GAMES: 'pictionary-games',
  PICTIONARY_TEAMS: 'pictionary-teams', // child of pictionary-games
  TODOS: 'todos',
  // Household-wide module flags singleton. Resource definition is
  // built dynamically from declared module flags and pushed by the
  // Next.js server at startup (see `src/instrumentation.ts`).
  MODULE_FLAGS: 'module-flags',
} as const;

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
  login,
  logout,
  refreshCurrentUser,
  getCurrentUser,
  authStore,
};

export default aepbase;
