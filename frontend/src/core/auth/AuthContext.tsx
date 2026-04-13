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
 * module can write `map_provider` and have it visible everywhere via
 * `useAuth().user`.
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
import { queryClient, queryKeys } from '../api/queryClient';
import { logger } from '../utils/logger';

interface AuthProviderProps {
  children: React.ReactNode;
}

interface UserPreferenceRecord {
  id: string;
  map_provider?: MapProvider;
}

async function hydrateUserPreferences(user: User): Promise<User> {
  try {
    const prefs = await aepbase.list<UserPreferenceRecord>(
      AepCollections.USER_PREFERENCES,
      { parent: [AepCollections.USERS, user.id] },
    );
    if (prefs.length > 0) {
      return { ...user, map_provider: prefs[0].map_provider };
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

  useEffect(() => {
    const unsubscribe = aepbase.authStore.onChange((token, user) => {
      setState({
        user,
        token: token || null,
        isAuthenticated: !!token && !!user,
        isLoading: false,
      });
      if (!user) queryClient.clear();
      else queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
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
      logout();
    }
  }, [logout]);

  const value: AuthContextValue = { ...state, login, logout, refreshUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
