/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the application.
 */

import { createContext } from 'react';
import type { AuthContextValue, AuthState } from './types';

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
};

export const AuthContext = createContext<AuthContextValue>({
  ...initialState,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});
