'use client';

/**
 * React Query hook that POSTs a natural-language query to
 * `/api/omnibox/parse` and returns the parsed intent (or fallback).
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { OmniboxParseResponse } from '@/shared/omnibox/types';

async function postQuery(query: string): Promise<OmniboxParseResponse> {
  const token = aepbase.authStore.token;
  const userId = aepbase.getCurrentUser()?.id || '';
  const res = await fetch('/api/omnibox/parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-User-Id': userId,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`omnibox parse failed: HTTP ${res.status}`);
  }
  return (await res.json()) as OmniboxParseResponse;
}

export function useOmniboxParse() {
  return useMutation({
    mutationFn: postQuery,
    onError: (err) => logger.error('Omnibox parse error', err),
  });
}
