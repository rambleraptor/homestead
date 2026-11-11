/**
 * `POST <plural>/{id}:sync` — run one connection's pull now. Anyone who may
 * edit the connection may ask; the run itself happens in the background and
 * reports through the record's `sync_status`.
 */

import type { CustomMethodHandler } from '../../resources/types';
import { canUseRecord } from '../collection-access';
import { triggerPull } from '../sync-pulls';
import { connectionResourceFor } from './method';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const syncNow: CustomMethodHandler = async (ctx) => {
  const resource = connectionResourceFor(ctx.plural);
  if (!resource || !ctx.id) return json(404, { error: 'not a sync connection' });

  const parent = ctx.parent ?? [];
  const path = [...parent, ctx.plural, ctx.id].join('/');
  // Not found rather than forbidden, so the method doesn't reveal what exists.
  if (!(await canUseRecord(ctx.auth.token, resource, path, 'write'))) {
    return json(404, { error: `${path} not found` });
  }

  switch (triggerPull(resource, path)) {
    case 'queued':
      return json(200, { queued: true });
    case 'unknown':
      return json(404, { error: `${path} not found` });
    case 'unavailable':
      return json(503, { error: 'syncing is not running on this server yet' });
  }
};

export default syncNow;
