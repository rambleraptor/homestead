/**
 * `GET /api/household` — the directory, for household members only. Auth is
 * injected and the directory installed directly, so this tests the route alone.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AuthResult } from '@rambleraptor/homestead-core/server/aepbase';
import { setHouseholdDirectory } from '@rambleraptor/homestead-core/server/household';
import { makeHouseholdRoute } from '../../src/routes/household';

const MEMBERS = [
  { id: 'u1', name: 'Alex', admin: true },
  { id: 'u2', name: 'Sam', admin: false },
];

function asUser(id: string): AuthResult {
  return { token: 't', user: { id, path: `users/${id}`, email: `${id}@example.com`, type: 'regular' } };
}

const routeWith = (auth: AuthResult | null) => makeHouseholdRoute(async () => auth);

beforeEach(() => setHouseholdDirectory(() => MEMBERS));
afterEach(() => setHouseholdDirectory(null));

describe('GET /api/household', () => {
  test('401 when unauthenticated', async () => {
    expect((await routeWith(null).request('/')).status).toBe(401);
  });

  test('403 for someone outside the household', async () => {
    expect((await routeWith(asUser('guest')).request('/')).status).toBe(403);
  });

  test('the members, for a member', async () => {
    const res = await routeWith(asUser('u2')).request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ members: MEMBERS });
  });
});
