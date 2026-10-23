/**
 * The origin the VM's page lives at. The SPA's same-origin `/api/*` calls and
 * the server's own loopback calls (`${origin}/api/aep`) both land here, and the
 * fetch shim routes this origin into the app's fetch handler. It never
 * resolves to a real host.
 */
export const VM_ORIGIN = 'http://homestead.vm';

/** Where the VM serves the e2e AI stub (tests/e2e/config/ai-stub.ts) in-process. */
export const AI_STUB_ORIGIN = 'http://ai-stub.vm';
