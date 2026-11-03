/**
 * Core Authentication Types for Homestead
 */

import type { PermissionContext } from '../permissions/client';
import type { ViewAsIdentity } from './effectiveUser';

export type MapProvider = 'google' | 'apple';

export type UserType = 'superuser' | 'regular';

/** The session an OAuth callback delivers in the URL fragment. */
export interface OAuthSession {
  accessToken: string;
  /** Present when the server issued a refreshable session (the normal case). */
  refreshToken?: string;
  expiresIn?: number;
}

export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  avatar?: string;
  verified: boolean;
  emailVisibility?: boolean;
  created: string;
  updated: string;
  map_provider?: MapProvider;
  /** Ordered list of dashboard widget ids the user prefers (parsed from preferences). */
  dashboard_widget_order?: string[];
  /** Dashboard widget ids the user has hidden (parsed from preferences). */
  dashboard_hidden_widgets?: string[];
  /** App ids the user pinned to their sidebar over the default (parsed from preferences). */
  sidebar_pinned_apps?: string[];
  /** App ids the user unpinned from their sidebar over the default (parsed from preferences). */
  sidebar_unpinned_apps?: string[];
  type?: UserType;
  /**
   * The caller's permission context (group ids + expanded grants + whether
   * enforcement is on), hydrated on login from `/api/permissions/me`. Feeds the
   * client `can()` mirror (design §10). UX only — the engine is authoritative.
   */
  permissions?: PermissionContext;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  /**
   * Finish an OAuth login from the callback page: the federated callback handed
   * us a session in the URL fragment; this resolves the user via whoami,
   * hydrates preferences, and seeds the auth state, mirroring `login`.
   */
  completeOAuthLogin: (session: OAuthSession) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /**
   * The real logged-in account, unaffected by any "view as" preview. `user`
   * above is the *effective* identity the app renders as; `realUser` is always
   * the person actually signed in — used by the preview banner and to gate who
   * may start a preview. Equal to `user` when no preview is active.
   */
  realUser: User | null;
  /** The target being previewed, or null when not in a "view as" session. */
  viewAs: ViewAsIdentity | null;
  /**
   * Enter a "view as" preview. Only a superuser may call this; it is a no-op
   * otherwise. Overrides the effective identity (`user`) with the target so
   * every access gate reflects that user, while the real token keeps signing
   * requests.
   */
  startViewAs: (target: ViewAsIdentity) => void;
  /** Leave the preview and return to the real superuser's access. */
  stopViewAs: () => void;
}
