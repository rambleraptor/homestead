/**
 * @rambleraptor/homestead-client
 *
 * An isomorphic (browser / Node / Bun), zero-dependency TypeScript client for a
 * Homestead server — the AEP-over-SQLite engine behind the same-origin
 * `/api/aep` surface. It consolidates CRUD (with transparent pagination),
 * AEP-136 custom methods, AEP-151 operations, file upload/download, and auth
 * behind one fluent API whose only per-caller difference is a pluggable auth
 * strategy.
 *
 * ```ts
 * import { createHomesteadClient, password } from '@rambleraptor/homestead-client';
 *
 * const hs = createHomesteadClient({
 *   baseUrl: 'https://home.example.com',
 *   auth: password({ email, password }),
 * });
 *
 * const cards = hs.collection('gift-cards');
 * for await (const card of cards.list({ filter: 'archived = false' })) { ... }
 * const created = await cards.create({ merchant: 'REI', front_image: file });
 * const txns = cards.record(created.id).collection('transactions');
 * ```
 */

export {
  createHomesteadClient,
  HomesteadClient,
  normalizeBaseUrl,
  type HomesteadClientOptions,
} from './src/client';

export { HomesteadError, AepbaseError } from './src/errors';

export type {
  CollectionRef,
  RecordRef,
} from './src/refs';

export type {
  HomesteadUser,
  RawUser,
  Page,
  ListOptions,
  PageOptions,
  CreateOptions,
  DeleteOptions,
  RecordBody,
  MaybePromise,
} from './src/types';

export {
  OperationsApi,
  OperationFailedError,
  type Operation,
  type AwaitOperationOptions,
} from './src/operations';

export {
  AuthApi,
  OAuthApi,
  type OAuthProvider,
} from './src/auth-api';

// Auth strategies — the seam that adapts the client to each caller.
export type { AuthStrategy, AuthTransport } from './src/auth/strategy';
export { anonymous } from './src/auth/anonymous';
export { bearerToken } from './src/auth/bearer';
export { password } from './src/auth/password';
export { profile, type ProfileCredentials } from './src/auth/profile';
export {
  browserSession,
  type BrowserSessionStrategy,
  type BrowserSessionOptions,
  type SessionListener,
} from './src/auth/browser';
