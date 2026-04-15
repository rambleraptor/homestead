'use client';

/**
 * Natural-language omnibox page.
 *
 * Superuser-only. Users type a query; the server parses it into an
 * `OmniboxIntent`; `OmniboxDispatcher` renders the resolved module's UI
 * inline. URL is kept in sync via `?q=` so intents are shareable.
 */

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/core/auth/useAuth';
import { Spinner } from '@/shared/components/Spinner';
import { OmniboxInput } from '@/shared/omnibox/OmniboxInput';
import { OmniboxDispatcher } from '@/shared/omnibox/OmniboxDispatcher';
import { useOmniboxParse } from '@/shared/omnibox/useOmniboxParse';
import type { OmniboxParseResponse } from '@/shared/omnibox/types';

export default function SearchPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && user.type !== 'superuser') {
      router.replace('/dashboard');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.type !== 'superuser') {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Suspense fallback={<Spinner size="lg" />}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const parseMutation = useOmniboxParse();
  const [response, setResponse] = useState<OmniboxParseResponse | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  // Kick off a parse whenever the URL `?q=` changes (including first load
  // and back/forward navigation).
  useEffect(() => {
    const q = searchParams.get('q')?.trim() ?? '';
    if (!q || q === lastQuery) return;
    setLastQuery(q);
    parseMutation.mutate(q, {
      onSuccess: (data) => setResponse(data),
      onError: () =>
        setResponse({
          intent: null,
          fallback: false,
          message: 'Something went wrong parsing that query.',
        }),
    });
    // parseMutation is stable per-render; listing it causes loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = (query: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', query);
    router.replace(`/search?${params.toString()}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Ask HomeOS</h1>
        <p className="text-sm text-gray-600">
          Type what you need. Results render as the module&rsquo;s real UI.
        </p>
      </div>

      <OmniboxInput
        initialQuery={initialQuery}
        isLoading={parseMutation.isPending}
        onSubmit={handleSubmit}
      />

      {lastQuery && !parseMutation.isPending && response && (
        <OmniboxDispatcher
          intent={response.intent}
          fallback={response.fallback}
        />
      )}
    </div>
  );
}
