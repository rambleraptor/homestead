import { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Providers } from './providers';
import { AppShell } from '@rambleraptor/homestead-core/layout/AppShell';
import { Login } from '@rambleraptor/homestead-core/router/Login';
import { AuthCallback } from '@rambleraptor/homestead-core/router/AuthCallback';
import { Authorize } from '@rambleraptor/homestead-core/router/Authorize';
import { ErrorBoundary } from '@rambleraptor/homestead-core/shared/components/ErrorBoundary';
import { AppRoute } from './apps/AppRoute';

/**
 * Authenticated layout. Renders the app chrome (sidebar/header + auth
 * guard) once and swaps the matched child route through `<Outlet>`, so
 * navigating between pages doesn't remount the shell.
 */
function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function App() {
  return (
    <Providers>
      {/* The last resort, for a throw outside a page (the shell, sign-in). */}
      <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center">
                  Loading...
                </div>
              }
            >
              <Login />
            </Suspense>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center">
                  Loading...
                </div>
              }
            >
              <AuthCallback />
            </Suspense>
          }
        />
        <Route
          path="/authorize"
          element={
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center">
                  Loading...
                </div>
              }
            >
              <Authorize />
            </Suspense>
          }
        />
        <Route element={<ShellLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {/* The HSA app became the Receipts app; keep old bookmarks working. */}
          <Route path="/hsa" element={<Navigate to="/receipts" replace />} />
          <Route path="*" element={<AppRoute />} />
        </Route>
      </Routes>
      </ErrorBoundary>
    </Providers>
  );
}
