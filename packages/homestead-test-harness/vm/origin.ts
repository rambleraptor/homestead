/**
 * The origin the VM's page lives at. The SPA's same-origin `/api/*` calls and
 * the server's own loopback calls (`${origin}/api/aep`) both land here, and the
 * fetch shim routes this origin into the app's fetch handler. It never
 * resolves to a real host.
 */
export const VM_ORIGIN = 'http://homestead.vm';
