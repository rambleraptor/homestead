/**
 * Shared aepbase seed/cleanup helpers for e2e tests, built on the shared
 * `@rambleraptor/homestead-client`.
 *
 * App-specific seed/cleanup helpers (createGiftCard, deleteAllPeople,
 * createGame, …) live next to each feature app under
 * `packages/homestead-apps/<app>/e2e/helpers.ts`. This file holds the client
 * factory every helper builds on ({@link e2eClient}) plus a handful of
 * utilities that don't belong to any one app (the household-wide `app-flags`
 * singleton, superuser-only user CRUD, groups, and the raw custom-method POST).
 */

import {
  createHomesteadClient,
  bearerToken,
  HomesteadError,
  type HomesteadClient,
  type RecordRef,
} from '@rambleraptor/homestead-client';
import { getAepbaseUrl } from '../config/aepbase.setup';

/**
 * A {@link HomesteadClient} acting as the holder of `token`, pointed at the
 * running e2e server's engine. `getAepbaseUrl()` already ends in `/api/aep`,
 * which the client tolerates. This is the one seam every e2e helper and spec
 * uses to talk to the engine — there is no hand-rolled REST layer anymore.
 */
export function e2eClient(token: string): HomesteadClient {
  return createHomesteadClient({
    baseUrl: getAepbaseUrl(),
    auth: bearerToken(token),
  });
}

/** True when an error is the client's 404 (a record/collection already gone). */
export function isNotFound(err: unknown): boolean {
  return err instanceof HomesteadError && err.code === 404;
}

/**
 * List every record, returning `[]` when the caller is forbidden (403) or the
 * collection is absent (404). This is the resilience the old `aepList` had, and
 * both cleanup loops and permission checks depend on it — a denied user must see
 * an empty list rather than an exception.
 */
export async function listOrEmpty<T>(
  token: string,
  plural: string,
  opts: { parent?: string[]; filter?: string } = {},
): Promise<T[]> {
  const collection = opts.parent
    ? recordAt(e2eClient(token), opts.parent).collection<T>(plural)
    : e2eClient(token).collection<T>(plural);
  try {
    return await collection.listAll({ filter: opts.filter });
  } catch (err) {
    if (err instanceof HomesteadError && (err.code === 403 || err.code === 404)) {
      return [];
    }
    throw err;
  }
}

/**
 * Delete a record, treating a 404 as success. Cleanup loops delete freshly
 * listed ids, but a cascade or a concurrent teardown can remove one first —
 * mirrors the old helper's swallow of 404 on delete.
 */
export async function deleteIfPresent(
  token: string,
  plural: string,
  id: string,
  opts: { parent?: string[]; force?: boolean } = {},
): Promise<void> {
  const collection = opts.parent
    ? recordAt(e2eClient(token), opts.parent).collection(plural)
    : e2eClient(token).collection(plural);
  try {
    await collection.record(id).delete({ force: opts.force });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/**
 * Resolve a parent chain expressed as the alternating `[plural, id, …]` array
 * to its innermost record ref, e.g. `['groups', g]` → `/groups/{g}`.
 */
function recordAt(hs: HomesteadClient, parent: string[]): RecordRef<Record<string, unknown>> {
  let record: RecordRef<Record<string, unknown>> = hs.collection(parent[0]).record(parent[1]);
  for (let i = 2; i < parent.length; i += 2) {
    record = record.collection<Record<string, unknown>>(parent[i]).record(parent[i + 1]);
  }
  return record;
}

/**
 * Invoke an AEP-136/151 custom method and return the raw {@link Response} so
 * callers can assert on status (a 202 carrying an operation for async methods,
 * or a pre-flight rejection). `path` is engine-relative, e.g.
 * `/documents/abc123:classify`.
 */
export async function postCustomMethod(
  token: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return e2eClient(token).raw(path, {
    method: 'POST',
    body: (body ?? {}) as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// App flags (household-wide singleton — not app-specific)
// ---------------------------------------------------------------------------

interface AppFlagsRecord {
  id: string;
  [field: string]: unknown;
}

/** Upsert a single app flag. Mirrors `useUpdateAppFlag.upsertFlag`. */
export async function setAppFlag(
  token: string,
  appId: string,
  key: string,
  value: string | number | boolean,
): Promise<void> {
  const flatField = `${appId.replace(/-/g, '_')}__${key}`;
  const payload = { [flatField]: value };
  const flags = e2eClient(token).collection<AppFlagsRecord>('app-flags');
  const existing = await flags.listAll();
  if (existing.length > 0) {
    await flags.record(existing[0].id).update(payload);
    return;
  }
  await flags.create(payload);
}

// ---------------------------------------------------------------------------
// Users (superuser-only — admin CRUD over the user collection)
// ---------------------------------------------------------------------------

interface CreateUserInput {
  email: string;
  password: string;
  display_name?: string;
  type?: 'regular' | 'superuser';
  /**
   * Skip joining the Members group. A household is closed by default, so a user
   * created without a role can read and write nothing — which is occasionally
   * exactly what a test wants to assert, and otherwise a trap. Defaults to
   * false: a new regular user gets the same access the create-user UI gives one.
   */
  noRole?: boolean;
}

/** Seeded role-bearing group conferring `member` (see `permissions/seed.ts`). */
const MEMBER_GROUP_ID = 'members';

export interface UserRecord {
  id: string;
  email: string;
  display_name?: string;
  type?: 'regular' | 'superuser';
}

export async function createUser(
  adminToken: string,
  data: CreateUserInput,
): Promise<UserRecord> {
  const user = await e2eClient(adminToken).collection<UserRecord>('users').create({
    email: data.email,
    password: data.password,
    display_name: data.display_name || '',
    type: data.type || 'regular',
  });
  // Superusers break glass past enforcement, so a role would be inert for them.
  if (!data.noRole && (data.type ?? 'regular') === 'regular') {
    await addGroupMember(adminToken, MEMBER_GROUP_ID, user.id);
  }
  return user;
}

// ---------------------------------------------------------------------------
// Groups (permissions §9.2 — the audience primitive that replaced account tags)
// ---------------------------------------------------------------------------

interface GroupRecord {
  id: string;
  name: string;
}

/** Create a group (superuser-only write). */
export async function createGroup(
  adminToken: string,
  name: string,
): Promise<GroupRecord> {
  return e2eClient(adminToken).collection<GroupRecord>('groups').create({ name });
}

/** Add a user to a group via the parented `/groups/{id}/group-memberships`. */
export async function addGroupMember(
  adminToken: string,
  groupId: string,
  userId: string,
): Promise<void> {
  await e2eClient(adminToken)
    .collection('groups')
    .record(groupId)
    .collection('group-memberships')
    .create({ user: userId });
}
