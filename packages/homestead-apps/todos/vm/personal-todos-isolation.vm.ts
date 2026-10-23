/**
 * Personal todo isolation (engine-enforced privacy), on the VM tier.
 *
 * A port of ../e2e/personal-todos-isolation.spec.ts. Personal todos live under
 * `/users/{uid}/personal-todos`, so the engine's user-scope check must keep
 * them private: one regular user can neither list nor fetch another's. This is
 * an API-level test — the guarantee is in the engine, not the UI — using two
 * distinct regular users (superusers bypass the scope check, so they can't
 * prove isolation). Each test boots from a fresh copy of the template
 * database, so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { getAepbaseUrl } from '../../../../tests/e2e/config/aepbase.setup';
import { createUser } from '../../../../tests/e2e/utils/aepbase-helpers';
import { createPersonalTodo, listPersonalTodos } from '../e2e/helpers';

const USER_B_EMAIL = 'user-b-personal@test.local';
const USER_B_PASSWORD = 'Password123!';

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }
  return ((await res.json()) as { token: string }).token;
}

describe('Personal todo isolation', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  test("a user cannot see or fetch another user's personal todos", async () => {
    // userA is the template's regular member; create userB as a second one.
    const { token: userToken, id: userId } = h.member;
    const userB = await createUser(h.admin.token, {
      email: USER_B_EMAIL,
      password: USER_B_PASSWORD,
      display_name: 'User B',
    });
    const userBToken = await login(USER_B_EMAIL, USER_B_PASSWORD);

    // userA creates a private todo.
    const todo = await createPersonalTodo(userToken, userId, {
      title: 'A secret',
    });

    // userA sees it under their own path.
    const mine = await listPersonalTodos(userToken, userId);
    expect(mine.map((t) => t.id)).toContain(todo.id);

    // userB's own personal list is unaffected — no leakage across users.
    const theirs = await listPersonalTodos(userBToken, userB.id);
    expect(theirs.map((t) => t.title)).not.toContain('A secret');

    // userB cannot list userA's personal todos — the engine 403s cross-user
    // access to a user-parented collection.
    await expect(listPersonalTodos(userBToken, userId)).rejects.toThrow();
  });
});
