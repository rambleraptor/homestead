/**
 * Main App Component
 *
 * Root component that sets up providers and routing
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './core/auth/AuthContext';
import { Router } from './core/router/Router';
import { queryClient } from './core/api/queryClient';
import { ToastProvider } from './shared/components/ToastProvider';
import { ErrorBoundary } from './shared/components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <Router />
          </ToastProvider>
        </AuthProvider>
        {/* React Query Devtools - only shows in development */}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
