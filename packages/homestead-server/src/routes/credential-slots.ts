/**
 * `GET /api/credential-slots` — the credentials Homestead needs and whether
 * each is set (`@rambleraptor/homestead-core/server/credential-slots`).
 * Superusers only, like the credentials themselves; it names environment
 * variables and sources, never a value.
 */

import { Hono } from 'hono';
import { authenticate } from '@rambleraptor/homestead-core/server/aepbase';
import { credentialSlotStatuses } from '@rambleraptor/homestead-core/server/credential-slots';
import type { AuthFn } from './household';

export function makeCredentialSlotsRoute(authFn: AuthFn = authenticate): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const auth = await authFn(c.req.raw);
    if (!auth) return c.json({ error: 'authentication required' }, 401);
    if (auth.user.type !== 'superuser') return c.json({ error: 'only superusers can see credentials' }, 403);
    return c.json({ slots: await credentialSlotStatuses(auth.token) });
  });

  return app;
}
