/**
 * Higher-order component for permission checking
 */

import { PermissionGuard } from './PermissionGuard';
import type { UserRole } from '../auth/types';

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  anyOf?: UserRole[];
  redirectTo?: string;
  fallback?: React.ReactNode;
  hasPermission?: (userRole: UserRole) => boolean;
}

/**
 * Higher-order component version of PermissionGuard
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<PermissionGuardProps, 'children'>
) {
  return function PermissionWrappedComponent(props: P) {
    return (
      <PermissionGuard {...options}>
        <Component {...props} />
      </PermissionGuard>
    );
  };
}
