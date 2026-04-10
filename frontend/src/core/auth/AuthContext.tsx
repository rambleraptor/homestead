/**
 * Authentication Provider Component
 *
 * Provides authentication state and methods throughout the application.
 * Talks to aepbase via the thin client wrapper at `core/api/aepbase`.
 *
 * Differences from the previous PocketBase implementation:
 *  - No `register`. aepbase has no signup endpoint; users are provisioned
 *    out-of-band (initial superuser is printed to stdout on first start).
 *  - `refreshUser` re-fetches both the aepbase user record AND the user's
 *    `preferences` child resource, merging `map_provider` into the User
 *    view model so existing consumers (settings, people module) keep
 *    working without changes.
 */

import { useEffect, useState, useCallback } from 'react';
import type {
  AuthContextValue,
  AuthState,
  LoginCredentials,
  MapProvider,
  User,
} from './types';
import { AuthContext } from './context';
import { aepbase, AepCollections } from '../api/aepbase';
import { pb, Collections } from '../api/pocketbase';
import { isAepbaseEnabled } from '../api/backend';
import { queryClient, queryKeys } from '../api/queryClient';
import { logger } from '../utils/logger';

interface AuthProviderProps {
  children: React.ReactNode;
}

interface UserPreferenceRecord {
  id: string;
  map_provider?: MapProvider;
}

interface PbUserRecord {
  id: string;
  email: string;
  map_provider?: MapProvider;
}

/**
 * Merge per-user settings (currently just `map_provider`) into the User view
 * model. The lookup branches on the `settings` backend flag so the read side
 * sees whatever backend the WRITE side just wrote to:
 *
 *  - aepbase mode: list `/users/{id}/preferences` and use the first record.
 *  - PB mode: fetch the PocketBase user by email (PB and aepbase ids are
 *    independent, but emails match for any user that exists in both).
 */
async function hydrateUserPreferences(user: User): Promise<User> {
  try {
    if (isAepbaseEnabled('settings')) {
      const prefs = await aepbase.list<UserPreferenceRecord>(
        AepCollections.USER_PREFERENCES,
        { parent: [AepCollections.USERS, user.id] },
      );
      if (prefs.length > 0) {
        return { ...user, map_provider: prefs[0].map_provider };
      }
      return user;
    }

    // PocketBase path: look up by email since PB ids ≠ aepbase ids.
    const pbUser = await pb
      .collection(Collections.USERS)
      .getFirstListItem<PbUserRecord>(`email = "${user.email}"`)
      .catch(() => null);
    if (pbUser?.map_provider) {
      return { ...user, map_provider: pbUser.map_provider };
    }
  } catch (error) {
    // Don't block login on a preferences fetch failure — just log it.
    logger.error('Failed to fetch user preferences', error);
  }
  return user;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Initialize with neutral state to avoid hydration mismatch.
  // We sync with the aepbase auth store after mount.
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  /**
   * Initialize auth state from the aepbase auth store after mount. The store
   * itself is hydrated from localStorage in its constructor; we just read it
   * here to avoid an SSR/client mismatch on first paint.
   */
  useEffect(() => {
    const user = aepbase.getCurrentUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      user,
      token: aepbase.authStore.token || null,
      isAuthenticated: aepbase.authStore.isValid,
      isLoading: false,
    });
  }, []);

  /**
   * Subscribe to auth store changes so login/logout from anywhere in the
   * app (including direct wrapper calls) flows back into React state.
   */
  useEffect(() => {
    const unsubscribe = aepbase.authStore.onChange((token, user) => {
      setState({
        user,
        token: token || null,
        isAuthenticated: !!token && !!user,
        isLoading: false,
      });

      if (!user) {
        queryClient.clear();
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const baseUser = await aepbase.login(credentials.email, credentials.password);
      const hydrated = await hydrateUserPreferences(baseUser);
      // Re-save through the store so onChange listeners (and React state) see
      // the merged map_provider field.
      aepbase.authStore.save(aepbase.authStore.token, hydrated);

      await queryClient.invalidateQueries();
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    aepbase.logout();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    queryClient.clear();
  }, []);

  /**
   * Re-fetch the user record and preferences from the server. Used by the
   * settings module after writing `map_provider` to make the new value visible
   * everywhere that reads `useAuth().user`.
   */
  const refreshUser = useCallback(async () => {
    if (!aepbase.authStore.isValid) return;

    try {
      const baseUser = await aepbase.refreshCurrentUser();
      if (!baseUser) return;
      const hydrated = await hydrateUserPreferences(baseUser);
      aepbase.authStore.save(aepbase.authStore.token, hydrated);

      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
    } catch (error) {
      logger.error('Failed to refresh user', error);
      // Token might be invalid or user deleted — drop the session.
      logout();
    }
  }, [logout]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
