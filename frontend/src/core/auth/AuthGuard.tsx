/**
 * AuthGuard Component
 *
 * Protects routes that require authentication.
 * Redirects unauthenticated users to login page.
 */


import { Navigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  if (isLoading) {
    if (!showLoading) return null;

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save the location they were trying to access
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
