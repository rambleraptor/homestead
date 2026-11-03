/**
 * Authentication Provider Component
 *
 * Talks to aepbase via the thin wrapper at `core/api/aepbase`. POST
 * `/users/:login` for sign-in, Bearer token persisted in localStorage,
 * onChange subscription for cross-tab auth sync.
 *
 * There is no `register` — aepbase has no self-serve signup endpoint; users
 * are provisioned by a superuser via `POST /users`. `refreshUser` re-fetches
 * the aepbase user record AND the user's `preferences` child so the settings
 * app can write `map_provider` and have it visible everywhere via
 * `useAuth().user`.
 */

import { USERS, USER_PREFERENCES } from '@rambleraptor/homestead-core/resources/builtins';
import { useEffect, useState, useCallback, useMemo } from 'react';
import type {
  AuthContextValue,
  AuthState,
  LoginCredentials,
  MapProvider,
  OAuthSession,
  User,
} from './types';
import { computeEffectiveUser, type ViewAsIdentity } from './effectiveUser';
import { AuthContext } from './context';
import { aepbase, AepbaseError } from '../api/aepbase';
import { queryClient, queryKeys } from '../api/queryClient';
import { clearPersistedQueryCache } from '../api/persistQueryClient';
import { outbox } from '../api/outbox';
import { logger } from '../utils/logger';
import { fetchPermissionContext, isRowDependent } from '../permissions/client';

interface AuthProviderProps {
  children: React.ReactNode;
}

interface UserPreferenceRecord {
  id: string;
  /** Legacy field, replaced by `people__map_provider`. */
  map_provider?: MapProvider;
  /** Per-user setting declared by the People app. */
  people__map_provider?: MapProvider;
  dashboard_widget_order?: string;
  dashboard_hidden_widgets?: string;
}

function parseStringArray(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed;
    }
  } catch {
    // fall through to undefined
  }
  return undefined;
}

const VALID_MAP_PROVIDERS: readonly MapProvider[] = ['google', 'apple'];

function coerceMapProvider(raw: unknown): MapProvider | undefined {
  if (typeof raw !== 'string') return undefined;
  return VALID_MAP_PROVIDERS.includes(raw as MapProvider)
    ? (raw as MapProvider)
    : undefined;
}

/**
 * Best-effort copy of the legacy `map_provider` field into the new
 * `people__map_provider` slot. Fire-and-forget — failures are logged
 * but don't block sign-in. Idempotent: only runs when the legacy field
 * is set and the new field is absent.
 */
async function backfillMapProvider(
  userId: string,
  preferenceId: string,
  legacyValue: MapProvider,
): Promise<void> {
  try {
    await aepbase.update<UserPreferenceRecord>(
      USER_PREFERENCES,
      preferenceId,
      { people__map_provider: legacyValue },
      { parent: [USERS, userId] },
    );
  } catch (error) {
    logger.warn('Failed to backfill people__map_provider', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function hydrateUserPreferences(user: User): Promise<User> {
  const [prefsResult, permissions] = await Promise.all([
    (async () => {
      try {
        return await aepbase.list<UserPreferenceRecord>(USER_PREFERENCES, {
          parent: [USERS, user.id],
        });
      } catch (error) {
        logger.error('Failed to fetch user preferences', error);
        return [] as UserPreferenceRecord[];
      }
    })(),
    fetchPermissionContext(aepbase.authStore.token),
  ]);

  let merged: User = { ...user, permissions };

  if (prefsResult.length > 0) {
    const record = prefsResult[0];
    const flattened = coerceMapProvider(record.people__map_provider);
    const legacy = coerceMapProvider(record.map_provider);
    const mapProvider = flattened ?? legacy;

    // Lazy migration: copy the legacy value into the new slot the
    // first time we see one without the other. The cleared legacy
    // field can be dropped from the schema in a follow-up after a
    // deploy cycle.
    if (!flattened && legacy) {
      void backfillMapProvider(user.id, record.id, legacy);
    }

    merged = {
      ...merged,
      map_provider: mapProvider,
      dashboard_widget_order: parseStringArray(record.dashboard_widget_order),
      dashboard_hidden_widgets: parseStringArray(record.dashboard_hidden_widgets),
    };
  }

  return merged;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // "View as user" preview (superuser debugging tool). In-memory only: a page
  // reload always returns to the real superuser — a preview never sticks.
  const [viewAs, setViewAs] = useState<ViewAsIdentity | null>(null);

  useEffect(() => {
    const user = aepbase.getCurrentUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      user,
      token: aepbase.authStore.token || null,
      // Require both, matching onChange below; the bootstrap effect validates.
      isAuthenticated: aepbase.authStore.isValid && !!user,
      isLoading: false,
    });
  }, []);

  useEffect(() => {
    let lastUserId: string | null = aepbase.getCurrentUser()?.id ?? null;
    const unsubscribe = aepbase.authStore.onChange((token, user) => {
      setState({
        user,
        token: token || null,
        isAuthenticated: !!token && !!user,
        isLoading: false,
      });
      const nextUserId = user?.id ?? null;
      // On logout OR when a different user logs in (same browser session),
      // drop both the in-memory query cache and its persisted snapshot —
      // otherwise the next `PersistQueryClientProvider` mount rehydrates
      // the previous user's optimistic state into the new session.
      if (!user || nextUserId !== lastUserId) {
        // A "view as" preview belongs to the superuser who opened it; end it
        // when the real account changes or signs out. A same-user token
        // refresh (nextUserId === lastUserId) falls through and preserves it.
        setViewAs(null);
        queryClient.clear();
        clearPersistedQueryCache();
        void outbox.clear();
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
      }
      lastUserId = nextUserId;
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const baseUser = await aepbase.login(credentials.email, credentials.password);
      const hydrated = await hydrateUserPreferences(baseUser);
      aepbase.authStore.save(aepbase.authStore.token, hydrated);
      await queryClient.invalidateQueries();
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const completeOAuthLogin = useCallback(async (session: OAuthSession) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const baseUser = await aepbase.completeOAuthLogin(session);
      const hydrated = await hydrateUserPreferences(baseUser);
      aepbase.authStore.save(aepbase.authStore.token, hydrated);
      await queryClient.invalidateQueries();
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    setViewAs(null);
    aepbase.logout();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    queryClient.clear();
    clearPersistedQueryCache();
    void outbox.clear();
  }, []);

  const startViewAs = useCallback((target: ViewAsIdentity) => {
    // Only a real superuser may preview another user's access; the server
    // route that resolves the target's permissions is superuser-gated too.
    if (aepbase.getCurrentUser()?.type !== 'superuser') return;
    setViewAs(target);
  }, []);

  const stopViewAs = useCallback(() => setViewAs(null), []);

  const refreshUser = useCallback(async () => {
    if (!aepbase.authStore.isValid) return;
    try {
      const baseUser = await aepbase.refreshCurrentUser();
      if (!baseUser) return;
      const hydrated = await hydrateUserPreferences(baseUser);
      aepbase.authStore.save(aepbase.authStore.token, hydrated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
    } catch (error) {
      // Only an explicit auth rejection ends the session. Network-level
      // failures (most commonly a page navigation aborting the in-flight
      // fetch with `TypeError: Failed to fetch`) are transient — logging
      // out on them wipes a perfectly valid session.
      if (error instanceof AepbaseError && (error.code === 401 || error.code === 403)) {
        logger.error('Session rejected during refresh; signing out', error);
        logout();
        return;
      }
      logger.warn('Failed to refresh user (transient); keeping session', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [logout]);

  // The mount effect trusts a persisted token optimistically (a local check),
  // but a reset/reprovisioned instance can leave a stale token that routes
  // straight to a 401'ing dashboard instead of the login/setup screen.
  // Validate once on load: refreshUser drops the session on 401/403 and keeps
  // it on transient failures. A token with no user is unusable, so drop it.
  useEffect(() => {
    if (!aepbase.authStore.isValid) return;
    if (!aepbase.getCurrentUser()) {
      logout();
      return;
    }
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nav visibility for a *filtered* collection depends on whether the caller has
  // a visible row, so it moves with the data and not only with the grants:
  // upload your first document and the app has to appear; delete your last and
  // it has to go. Watch settled create/delete mutations and refresh when the
  // collection they touched is one of those row-dependent ones — which is
  // almost never, so this costs nothing in the common case.
  //
  // `refreshUser` is a heavier call than strictly needed (it re-fetches the user
  // and preferences alongside the permission context), but it's the one
  // well-trodden path that writes a hydrated user back to the auth store; a
  // permissions-only variant would duplicate that write for a request that
  // fires rarely.
  useEffect(() => {
    const currentUser = state.user;
    if (!currentUser) return;
    return queryClient.getMutationCache().subscribe((event) => {
      const mutation = 'mutation' in event ? event.mutation : undefined;
      if (!mutation || mutation.state.status !== 'success') return;
      // Keys are ['app', appId, '<verb>-<singular>'] (see
      // registerResourceMutationDefaults). Only create/delete can flip a
      // collection between empty and non-empty.
      const key = mutation.options.mutationKey;
      if (!Array.isArray(key) || key.length < 3) return;
      const [, appId, action] = key as [string, string, string];
      const match = /^(create|delete)-(.+)$/.exec(String(action));
      if (!match) return;
      if (
        isRowDependent(
          currentUser.permissions,
          currentUser.id,
          currentUser.type === 'superuser',
          match[2],
          appId,
        )
      ) {
        void refreshUser();
      }
    });
  }, [state.user, refreshUser]);

  // A preview only ever applies on top of a real superuser session; if the
  // real account isn't a superuser, ignore any lingering target.
  const activeViewAs = state.user?.type === 'superuser' ? viewAs : null;
  const effectiveUser = useMemo(
    () => computeEffectiveUser(state.user, activeViewAs),
    [state.user, activeViewAs],
  );

  const value: AuthContextValue = {
    ...state,
    // `user` is the effective identity the app renders as (target during a
    // preview); `realUser` is always the person actually signed in.
    user: effectiveUser,
    realUser: state.user,
    viewAs: activeViewAs,
    startViewAs,
    stopViewAs,
    login,
    completeOAuthLogin,
    logout,
    refreshUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
