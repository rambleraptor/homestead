/**
 * AuthGuard Component
 *
 * Protects routes that require authentication.
 * Redirects unauthenticated users to login page.
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * Path to redirect to if not authenticated
   * @default '/login'
   */
  redirectTo?: string;
  /**
   * Show loading spinner while checking auth
   * @default true
   */
  showLoading?: boolean;
}

export function AuthGuard({
  children,
  redirectTo = '/login',
  showLoading = true,
}: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Save the location they were trying to access via query param. The
      // query string rides along: a home-screen launch URL carries
      // `?chrome=none`, which must survive the trip through the login page.
      const returnUrl = encodeURIComponent(`${pathname}${search}`);
      navigate(`${redirectTo}?returnUrl=${returnUrl}`, { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate, pathname, search, redirectTo]);

  if (isLoading) {
    if (!showLoading) return null;

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-terracotta mx-auto"></div>
          <p className="mt-4 font-body text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Return null while redirect is happening
    return null;
  }

  return <>{children}</>;
}
