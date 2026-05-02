/**
 * useAuth Hook
 *
 * Custom hook to access authentication context.
 * Provides easy access to auth state and methods.
 */

import { useContext } from 'react';
import { AuthContext } from './context';

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to get current user (or null if not authenticated)
 */
export function useUser() {
  const { user } = useAuth();
  return user;
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
}
