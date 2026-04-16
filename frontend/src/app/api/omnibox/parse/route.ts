/**
 * Thin Next.js route shim — the handler lives with the omnibox feature.
 * Next.js App Router requires route handlers under `app/api/`, so we
 * re-export from `@/shared/omnibox/server` to keep feature-specific API
 * logic alongside the rest of the omnibox code.
 */
export { POST } from '@/shared/omnibox/server/parse';
