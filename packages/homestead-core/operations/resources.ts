import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
// The plural const lives in the runtime-agnostic contract module so the
// dispatcher, cron scheduler, and server store can reach it without importing
// this app. Re-export it here so app-local code has a single import surface.
import { OPERATIONS } from '@rambleraptor/homestead-core/resources/operations';

export { OPERATIONS };

export const operationsResources: ResourceDefinition[] = [
  {
    // AEP-151 long-running operation. Created by the custom-method gateway
    // when an async method is invoked; the method's background work later
    // flips `done` and writes `response` (success) or `error` (failure).
    // Top-level (no `parents`) so its path is `operations/{id}`, matching
    // AEP-151's poll endpoint. Household-shared: any authenticated member can
    // list/read/poll — `created_by` records the initiator for display only.
    // (The app's *UI* is superuser-gated; the collection itself stays ungated
    // because the app is always-installed under Superuser, so user-initiated
    // async methods — bulk import, receipt parsing — keep working.)
    singular: 'operation',
    plural: OPERATIONS,
    description:
      'An AEP-151 long-running operation tracking an async custom method.',
    user_settable_create: true,
    // Finished operations are kept three days from creation, then swept by the
    // platform retention cron. `done == true` keeps a still-running operation
    // however old — rescuing those is `sweepStaleOperations`' job at boot.
    retention: { days: 3, field: 'create_time', where: 'done == true' },
    fields: {
      // `path` + `create_time`/`update_time` are engine-managed (AEP-151 `path`).
      done: { type: 'boolean', default: false, required: true },
      // AEP-151 payload fields.
      metadata: { type: 'object', description: 'Service-specific progress/context.' },
      response: { type: 'object', description: 'Result payload on success.' },
      error: { type: 'object', description: 'AEP problem payload on failure.' },
      // Display / bookkeeping.
      status: {
        type: 'string',
        enum: ['pending', 'running', 'succeeded', 'failed'],
      },
      method: { type: 'string', description: 'The `plural:verb` that spawned it.' },
      title: { type: 'string', description: 'Human-readable label.' },
      created_by: {
        type: 'string',
        description: 'User id of the initiator.',
        reference: { resource: 'user' },
      },
    },
  },
];
