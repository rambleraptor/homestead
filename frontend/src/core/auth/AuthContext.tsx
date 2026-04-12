/**
 * Authentication Provider Component
 *
 * Branches on the `auth` backend flag:
 *  - PocketBase mode (default): uses pb.collection('users').authWithPassword
 *    and the PB authStore, exactly as before the migration. This is what
 *    the e2e suite and CI use, since they only spin up PocketBase.
 *  - aepbase mode: uses the thin wrapper at `core/api/aepbase` (POST
 *    `/users/:login`, Bearer token persisted in localStorage). Opt in with
 *    `NEXT_PUBLIC_USE_AEPBASE_AUTH=true`.
 *
 * `register` is gone — aepbase has no signup endpoint, and dropping it lets
 * the type stay backend-agnostic. `refreshUser` re-fetches the user record
 * AND the user's `preferences` so the settings module can write
 * `map_provider` and have it visible everywhere via `useAuth().user`.
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
import {
  pb,
  Collections,
  getCurrentUser as pbGetCurrentUser,
  clearAuth as pbClearAuth,
  onAuthChange as pbOnAuthChange,
} from '../api/pocketbase';
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
 * model. Branches on the `settings` flag, NOT the `auth` flag — read side
 * goes wherever the write side wrote.
 *
 * Caveat: PB-auth + aepbase-settings is unsupported because the user's PB
 * id won't exist in aepbase. Stick to consistent pairings.
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

    // PB settings path: look up by email since PB ids ≠ aepbase ids when
    // the auth backends differ.
    const pbUser = await pb
      .collection(Collections.USERS)
      .getFirstListItem<PbUserRecord>(`email = "${user.email}"`)
      .catch(() => null);
    if (pbUser?.map_provider) {
      return { ...user, map_provider: pbUser.map_provider };
    }
  } catch (error) {
    logger.error('Failed to fetch user preferences', error);
  }
  return user;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Hydrate from whichever auth store is active after mount. localStorage
  // only exists on the client, so we defer to an effect to avoid SSR drift.
  useEffect(() => {
    if (isAepbaseEnabled('auth')) {
      const user = aepbase.getCurrentUser();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        user,
        token: aepbase.authStore.token || null,
        isAuthenticated: aepbase.authStore.isValid,
        isLoading: false,
      });
    } else {
      const user = pbGetCurrentUser();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        user,
        token: pb.authStore.token || null,
        isAuthenticated: pb.authStore.isValid,
        isLoading: false,
      });
    }
  }, []);

  // Subscribe to whichever store is active so login/logout from anywhere in
  // the app flows back into React state.
  useEffect(() => {
    const useAep = isAepbaseEnabled('auth');
    const unsubscribe = useAep
      ? aepbase.authStore.onChange((token, user) => {
          setState({
            user,
            token: token || null,
            isAuthenticated: !!token && !!user,
            isLoading: false,
          });
          if (!user) queryClient.clear();
          else queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
        })
      : pbOnAuthChange((token, model) => {
          setState({
            user: model,
            token: token || null,
            isAuthenticated: !!token && !!model,
            isLoading: false,
          });
          if (!model) queryClient.clear();
          else queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
        });

    return () => {
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      let baseUser: User;
      if (isAepbaseEnabled('auth')) {
        baseUser = await aepbase.login(credentials.email, credentials.password);
        const hydrated = await hydrateUserPreferences(baseUser);
        aepbase.authStore.save(aepbase.authStore.token, hydrated);
      } else {
        const authData = await pb
          .collection(Collections.USERS)
          .authWithPassword(credentials.email, credentials.password);
        baseUser = authData.record as unknown as User;
        // hydrate happens automatically via PB authStore.onChange + the
        // useEffect above; we still want map_provider merged in so do it
        // explicitly and write it back to the local React state.
        const hydrated = await hydrateUserPreferences(baseUser);
        setState({
          user: hydrated,
          token: pb.authStore.token || null,
          isAuthenticated: true,
          isLoading: false,
        });
      }

      await queryClient.invalidateQueries();
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    if (isAepbaseEnabled('auth')) {
      aepbase.logout();
    } else {
      pbClearAuth();
    }
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    queryClient.clear();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      if (isAepbaseEnabled('auth')) {
        if (!aepbase.authStore.isValid) return;
        const baseUser = await aepbase.refreshCurrentUser();
        if (!baseUser) return;
        const hydrated = await hydrateUserPreferences(baseUser);
        aepbase.authStore.save(aepbase.authStore.token, hydrated);
      } else {
        if (!pb.authStore.isValid) return;
        await pb.collection(Collections.USERS).authRefresh();
        const baseUser = pbGetCurrentUser();
        if (!baseUser) return;
        const hydrated = await hydrateUserPreferences(baseUser);
        setState((prev) => ({ ...prev, user: hydrated }));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
    } catch (error) {
      logger.error('Failed to refresh user', error);
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
