'use client';

import React from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from '@rambleraptor/homestead-core/auth/AuthContext';
import { queryClient } from '@rambleraptor/homestead-core/api/queryClient';
import { persistOptions } from '@rambleraptor/homestead-core/api/persistQueryClient';
import { registerResourceMutationDefaults } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { getAllResourceDefsWithModule } from '@/modules/registry';
import { ToastProvider } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import dynamic from 'next/dynamic';

// Mutation defaults must be installed on the QueryClient *before* any
// `useMutation` references their key — including replays from the persisted
// queue when `PersistQueryClientProvider` rehydrates. Walking every declared
// resource at module scope guarantees that ordering and gives every module
// offline create/update/delete for free.
for (const { module, def } of getAllResourceDefsWithModule()) {
  const override = module.offlineOverrides?.[def.singular];
  if (override === false) continue;
  registerResourceMutationDefaults(queryClient, {
    moduleId: module.id,
    singular: def.singular,
    plural: def.plural,
    ...(override ?? {}),
  });
}

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
