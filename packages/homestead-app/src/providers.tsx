import { NativeIntegration } from '@rambleraptor/homestead-core/mobile/NativeIntegration';
import React, { Suspense, lazy } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from '@rambleraptor/homestead-core/auth/AuthContext';
import { queryClient } from '@rambleraptor/homestead-core/api/queryClient';
import { persistOptions } from '@rambleraptor/homestead-core/api/persistQueryClient';
import { registerResourceMutationDefaults } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { getAllResourceDefsWithApp } from '@/apps/registry';
import { ToastProvider } from '@rambleraptor/homestead-core/shared/components/ToastProvider';

// Mutation defaults must be installed on the QueryClient *before* any
// `useMutation` references their key — including replays from the persisted
// queue when `PersistQueryClientProvider` rehydrates. Walking every declared
// resource at module scope guarantees that ordering and gives every app
// offline create/update/delete for free.
for (const { app, def } of getAllResourceDefsWithApp()) {
  registerResourceMutationDefaults(queryClient, {
    appId: app.id,
    singular: def.singular,
    plural: def.plural,
    parents: def.parents,
  });
}

// Gate the dynamic import on `import.meta.env.DEV` so a production build
// (`vite build`, what `homestead start` runs) constant-folds this to the
// `() => null` branch and drops the import entirely. That keeps
// react-query-devtools a dev-only dependency: operators who install only
// production deps never need it, and Rollup never tries to resolve it.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : (_props: { initialIsOpen?: boolean }) => null;

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
        <NativeIntegration />
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </PersistQueryClientProvider>
  );
}
