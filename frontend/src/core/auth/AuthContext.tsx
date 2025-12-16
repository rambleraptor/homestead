/**
 * Authentication Provider Component
 *
 * Provides authentication state and methods throughout the application.
 * Manages user sessions, login, logout, and registration.
 */

import { useEffect, useState, useCallback } from 'react';
import type {
  AuthContextValue,
  AuthState,
  LoginCredentials,
  RegisterData,
  User,
} from './types';
import { AuthContext } from './context';
import { pb, getCurrentUser, clearAuth, onAuthChange, Collections } from '../api/pocketbase';
import { queryClient, queryKeys } from '../api/queryClient';
import { logger } from '../utils/logger';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Initialize state from PocketBase store immediately
  const [state, setState] = useState<AuthState>(() => {
    const user = getCurrentUser();
    return {
      user,
      token: pb.authStore.token || null,
      isAuthenticated: pb.authStore.isValid,
      isLoading: false,
    };
  });

  /**
   * Subscribe to auth changes
   */
  useEffect(() => {
    const unsubscribe = onAuthChange((token, model) => {
      setState({
        user: model,
        token: token || null,
        isAuthenticated: !!token && !!model,
        isLoading: false,
      });

      // Invalidate user queries on auth change
      if (!model) {
        queryClient.clear();
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Login with email and password
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const authData = await pb
        .collection(Collections.USERS)
        .authWithPassword(credentials.email, credentials.password);

      const user = authData.record as unknown as User;

      setState({
        user,
        token: pb.authStore.token || null,
        isAuthenticated: true,
        isLoading: false,
      });

      // Invalidate queries to fetch fresh data
      await queryClient.invalidateQueries();
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  /**
   * Logout current user
   */
  const logout = useCallback(() => {
    clearAuth();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });

    // Clear all cached data
    queryClient.clear();
  }, []);

  /**
   * Register new user
   */
  const register = useCallback(async (data: RegisterData) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Create the user
      await pb.collection(Collections.USERS).create({
        ...data,
        emailVisibility: true,
      });

      // Auto-login after registration
      await login({
        email: data.email,
        password: data.password,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [login]);

  /**
   * Refresh user data from server
   */
  const refreshUser = useCallback(async () => {
    if (!state.user?.id) return;

    try {
      const user = await pb.collection(Collections.USERS).getOne(state.user.id);
      setState((prev) => ({
        ...prev,
        user: user as unknown as User,
      }));

      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
    } catch (error) {
      logger.error('Failed to refresh user', error);
      // If refresh fails, user might be deleted or token invalid
      logout();
    }
  }, [state.user, logout]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    register,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
