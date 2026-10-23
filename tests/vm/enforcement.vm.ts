/**
 * Permission enforcement, on the VM tier.
 *
 * A port of tests/e2e/tests/permissions/enforcement.spec.ts. Enforcement lives
 * in the engine, not the UI, so this drives the real HTTP API (the server's
 * in-process fetch handler) with three real principals: two regular users
 * (alice, bob) and the bootstrap superuser (admin). It proves three things:
 *
 *   1. The Member role (`all`-scope write, conferred by the seeded Members
 *      group that `createUser` joins) gives a regular user full CRUD over a
 *      shared collection — the access an ordinary household member has. A
 *      household is closed by default, so this access comes from the role, not
 *      from any household-wide grant.
 *   2. Deny wins: a collection-scope deny blocks the named user's reads while
 *      everyone else keeps access, and lifting it restores them.
 *   3. Break-glass: the superuser account is never locked out, even by a deny
 *      that targets everyone.
 *
 * Each test boots from a fresh database (and the grant cache is off in the VM
 * config), so there are no grants or rows to clean up.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { getAepbaseUrl } from '../e2e/config/aepbase.setup';
import {
  deleteIfPresent,
  e2eClient,
  listOrEmpty,
  createUser,
  type UserRecord,
} from '../e2e/utils/aepbase-helpers';

const TODOS = 'todos';
const ACCESS_GRANTS = 'access-grants';

interface Todo {
  id: string;
  title: string;
  status: string;
}
interface Grant {
  id: string;
}

/** Log in a freshly-created user and return their bearer token. */
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

/** Raw GET so a test can assert on the status code (403 vs 200). */
async function getStatus(token: string, path: string): Promise<number> {
  const res = await fetch(`${getAepbaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status;
}

describe('permission enforcement', () => {
  let h: Harness;
  let adminToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    adminToken = h.admin.token;
  });

  afterEach(async () => {
    await h.close();
  });

  async function makeUser(label: string): Promise<{ user: UserRecord; token: string }> {
    const email = `perm-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'perm-e2e-password';
    const user = await createUser(adminToken, { email, password, display_name: label });
    return { user, token: await login(email, password) };
  }

  async function makeTodo(token: string, title: string): Promise<Todo> {
    return e2eClient(token).collection<Todo>(TODOS).create({ title, status: 'pending' });
  }

  test('the Member role gives a regular user full CRUD', async () => {
    const alice = await makeUser('alice');

    // Create
    const todo = await makeTodo(alice.token, 'buy milk');
    expect(todo.id).toBeTruthy();

    // Read + list
    const fetched = await e2eClient(alice.token).collection<Todo>(TODOS).get(todo.id);
    expect(fetched.title).toBe('buy milk');
    const listed = await listOrEmpty<Todo>(alice.token, TODOS);
    expect(listed.some((t) => t.id === todo.id)).toBe(true);

    // Update
    const updated = await e2eClient(alice.token)
      .collection<Todo>(TODOS)
      .record(todo.id)
      .update({ status: 'completed' });
    expect(updated.status).toBe('completed');

    // Delete
    await deleteIfPresent(alice.token, TODOS, todo.id);
    expect(await getStatus(alice.token, `/${TODOS}/${todo.id}`)).toBe(404);
  });

  test('a collection-scope deny blocks the named user, and lifting it restores access', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');

    const todo = await makeTodo(alice.token, 'shared task');

    // Baseline: with the Member role, Bob can read Alice's todo.
    expect(await getStatus(bob.token, `/${TODOS}/${todo.id}`)).toBe(200);

    // Admin denies Bob read on the whole `todo` collection.
    const deny = await e2eClient(adminToken).collection<Grant>(ACCESS_GRANTS).create({
      subject_type: 'user',
      subject_id: bob.user.id,
      target_scope: 'collection',
      resource_type: 'todo',
      capability: 'read',
      effect: 'deny',
    });

    // Deny wins: Bob is blocked (403 on the record, empty list)...
    expect(await getStatus(bob.token, `/${TODOS}/${todo.id}`)).toBe(403);
    expect((await listOrEmpty<Todo>(bob.token, TODOS)).some((t) => t.id === todo.id)).toBe(false);
    // ...while Alice still reads everything.
    expect(await getStatus(alice.token, `/${TODOS}/${todo.id}`)).toBe(200);

    // Lift the deny → Bob reads again.
    await deleteIfPresent(adminToken, ACCESS_GRANTS, deny.id);
    expect(await getStatus(bob.token, `/${TODOS}/${todo.id}`)).toBe(200);
  });

  test('the superuser is never locked out, even by a deny that targets everyone', async () => {
    const alice = await makeUser('alice');
    const todo = await makeTodo(alice.token, 'admin can still see me');

    // Deny *everyone* read on the todo collection.
    await e2eClient(adminToken).collection<Grant>(ACCESS_GRANTS).create({
      subject_type: 'everyone',
      target_scope: 'collection',
      resource_type: 'todo',
      capability: 'read',
      effect: 'deny',
    });

    // Alice (regular) is blocked; the superuser breaks glass.
    expect(await getStatus(alice.token, `/${TODOS}/${todo.id}`)).toBe(403);
    expect(await getStatus(adminToken, `/${TODOS}/${todo.id}`)).toBe(200);
    expect((await listOrEmpty<Todo>(adminToken, TODOS)).some((t) => t.id === todo.id)).toBe(true);
  });
});
