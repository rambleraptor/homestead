/**
 * The drop box, served in-process through the fetch shim: the Worker's own
 * request handling (`packages/homestead-drop`) over its in-memory store. So a
 * spec exercises the real exchange in both directions — a shortcut leaving a
 * link, Homestead registering boxes and collecting — and can reach into the
 * store to play a drop box that has been broken into.
 */

import { registerService } from '@rambleraptor/homestead-test-harness/vm/fetch-shim';
import { handle } from '../../../homestead-drop/src/app';
import { memoryStore } from '../../../homestead-drop/src/memory-store';
import type { Store } from '../../../homestead-drop/src/store';

export const DROP_STUB_ORIGIN = 'https://drop.test';
export const DROP_STUB_SECRET = 'drop-box-admin-secret-for-specs';

export interface DropBoxStub {
  store: Store;
}

/** Serve a fresh, empty drop box. Register in `beforeEach`; a later call replaces it. */
export function installDropBoxStub(): DropBoxStub {
  const store = memoryStore();
  registerService(DROP_STUB_ORIGIN, (req) => handle(req, { store, adminSecret: DROP_STUB_SECRET }));
  return { store };
}
