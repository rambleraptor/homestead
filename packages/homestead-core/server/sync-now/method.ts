/**
 * Synthesizes the `<plural>/{id}:sync` custom method on every resource a sync
 * pulls per record of (its `pull.connections`) — "Sync now" for one
 * connection. Like bulk import's, declaring the pull *is* the registration:
 * the method dispatches through the `/api/aep` gateway, shows up in
 * `GET /api/custom-methods`, and needs no entry under `customMethods`.
 *
 * Lives under `core/server/` because the handler it names is server-only.
 */

import type { ResourceCustomMethod } from '../../resources/types';
import { getAllResourceDefs, getPullConnectionResources } from '../../apps/registry';
import { SYNC_NOW_VERB } from '../../apps/sync';

/** Plural → singular of every pull connection resource. */
function connectionPlurals(): Map<string, string> {
  const connections = getPullConnectionResources();
  const out = new Map<string, string>();
  if (connections.size === 0) return out;
  for (const def of getAllResourceDefs()) {
    if (connections.has(def.singular)) out.set(def.plural, def.singular);
  }
  return out;
}

const SYNC_NOW_METHOD: ResourceCustomMethod = {
  target: 'item',
  method: 'POST',
  title: 'Sync now',
  description:
    'Run this connection\'s sync now instead of waiting for its next scheduled run. Answers ' +
    'at once; the outcome lands in the record\'s sync_status when the run finishes.',
  modelTools: { chat: false, mcp: false },
  response: {
    type: 'object',
    properties: { queued: { type: 'boolean' } },
    required: ['queued'],
  },
  load: () => import('./handler'),
};

/** The synthesized method for `(plural, verb)`, or undefined when it isn't one. */
export function syncNowCustomMethod(plural: string, verb: string): ResourceCustomMethod | undefined {
  if (verb !== SYNC_NOW_VERB) return undefined;
  return connectionPlurals().has(plural) ? SYNC_NOW_METHOD : undefined;
}

/** Every synthesized `:sync` method, keyed `${plural}:sync`. */
export function allSyncNowCustomMethods(): Record<string, ResourceCustomMethod> {
  const out: Record<string, ResourceCustomMethod> = {};
  for (const plural of connectionPlurals().keys()) {
    out[`${plural}:${SYNC_NOW_VERB}`] = SYNC_NOW_METHOD;
  }
  return out;
}

/** The connection resource singular behind `plural`, if it is one. */
export function connectionResourceFor(plural: string): string | undefined {
  return connectionPlurals().get(plural);
}
