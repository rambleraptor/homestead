'use client';

import React from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from '@/core/auth/AuthContext';
import { queryClient } from '@/core/api/queryClient';
import { persistOptions } from '@/core/api/persistQueryClient';
import { registerGroceryMutationDefaults } from '@/modules/groceries/registerMutationDefaults';
import { ToastProvider } from '@/shared/components/ToastProvider';
import dynamic from 'next/dynamic';

// Mutation defaults must be installed on the QueryClient *before* any
// `useMutation` references their key — including replays from the persisted
// queue when `PersistQueryClientProvider` rehydrates. Registering at module
// scope guarantees that ordering.
registerGroceryMutationDefaults(queryClient);

// Only load React Query DevTools on client side to avoid hydration issues
const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((mod) => mod.ReactQueryDevtools),
  { ssr: false }
);

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Drain queued offline mutations before refetching, so the server
        // sees the user's writes before we ask it for the truth.
        queryClient.resumePausedMutations().then(() => {
          queryClient.invalidateQueries();
        });
      }}
    >
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  );
}
