/**
 * Thin Next.js route shim — the handler lives in the hsa module.
 * Next.js App Router requires route handlers under `app/api/`, so we
 * re-export from `@/modules/hsa/server` to keep module-specific API
 * logic inside the module.
 */
export { POST } from '@/modules/hsa/server/parse-receipt';
