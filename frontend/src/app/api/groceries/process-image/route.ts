/**
 * Thin Next.js route shim — the handler lives in the groceries module.
 * Next.js App Router requires route handlers under `app/api/`, so we
 * re-export from `@/modules/groceries/server` to keep module-specific
 * API logic inside the module.
 */
export { POST } from '@/modules/groceries/server/process-image';
