/**
 * Tell the drop box which boxes exist, so it turns strangers away.
 *
 * A resource sync on `bookmark-inbox`: a new inbox's box is registered, and a
 * deleted inbox's box is removed with whatever was waiting in it — which is
 * how a shortcut's key is revoked. Durable like every push sync, so a drop box
 * that is down when an inbox is deleted still hears about it later.
 *
 * With no drop box configured there is nothing to tell, and the collecting
 * side registers a box it finds missing, so skipping here loses nothing.
 */

import type { SyncHandler } from '@rambleraptor/homestead-core/apps/sync';
import { BOX_ID } from '../dropBox';
import { configuredDropBox, dropBoxRequest } from './drop-box';

const handler: SyncHandler = async (ctx) => {
  const inbox = (ctx.event === 'delete' ? ctx.previous : ctx.record) as { box?: unknown } | null;
  const box = inbox?.box;
  if (typeof box !== 'string' || !BOX_ID.test(box)) return { skipped: 'no box' };

  const dropBox = await configuredDropBox(ctx.token);
  if (!dropBox) return { skipped: 'no drop box configured' };

  const res = await dropBoxRequest(dropBox, ctx.event === 'delete' ? 'DELETE' : 'PUT', `/boxes/${box}`);
  if (!res.ok) throw new Error(`the drop box answered ${res.status}`);
  return { [ctx.event === 'delete' ? 'removed' : 'registered']: true };
};

export default handler;
