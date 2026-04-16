/**
 * Thin Next.js route shim — the handler lives in the notifications module.
 * Next.js App Router requires route handlers under `app/api/`, so we
 * re-export from `@/modules/notifications/server` to keep module-specific
 * API logic inside the module.
 */
export { GET, POST } from '@/modules/notifications/server/cron';
