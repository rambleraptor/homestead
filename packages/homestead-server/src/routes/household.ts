/**
 * `GET /api/household` — who shares this Homestead, by name
 * (`@rambleraptor/homestead-core/household/types`). Any household member may
 * ask; anyone else (a guest, an account without a role) is refused, so the
 * directory never names people to someone outside it.
 */

import { Hono } from 'hono';
import { authenticate, type AuthResult } from '@rambleraptor/homestead-core/server/aepbase';
import { householdFor } from '@rambleraptor/homestead-core/server/household';

/** Auth resolver, injectable so the route can be tested without loopback auth. */
export type AuthFn = (request: Request) => Promise<AuthResult | null>;

export function makeHouseholdRoute(authFn: AuthFn = authenticate): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const auth = await authFn(c.req.raw);
    if (!auth) return c.json({ error: 'authentication required' }, 401);
    const members = householdFor(auth.user.id);
    if (members.length === 0) return c.json({ error: 'only household members can see the household' }, 403);
    return c.json({ members });
  });

  return app;
}
