/**
 * PermissionGuard Component
 *
 * Guards components/routes based on user permissions.
 * Supports role-based and module-specific permission checks.
 */


import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { UserRole } from '../auth/types';
import { hasRoleAccess } from './rbac';

interface PermissionGuardProps {
  children: React.ReactNode;
  /**
   * Required role to access this component
   */
  requiredRole?: UserRole;
  /**
   * Alternative: Check if user has any of these roles
   */
  anyOf?: UserRole[];
  /**
   * Path to redirect if access denied
   * @default '/unauthorized'
   */
  redirectTo?: string;
  /**
   * Fallback component to show instead of redirect
   */
  fallback?: React.ReactNode;
  /**
   * Custom permission check function
   */
  hasPermission?: (userRole: UserRole) => boolean;
}

export function PermissionGuard({
  children,
  requiredRole,
  anyOf,
  redirectTo = '/unauthorized',
  fallback,
  hasPermission,
}: PermissionGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return fallback ? <>{fallback}</> : <Navigate to="/login" replace />;
  }

  let hasAccess = true;

  // Check custom permission function
  if (hasPermission) {
    hasAccess = hasPermission(user.role);
  }
  // Check required role
  else if (requiredRole) {
    hasAccess = hasRoleAccess(user.role, requiredRole);
  }
  // Check if user has any of the specified roles
  else if (anyOf && anyOf.length > 0) {
    hasAccess = anyOf.some((role) => hasRoleAccess(user.role, role));
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
