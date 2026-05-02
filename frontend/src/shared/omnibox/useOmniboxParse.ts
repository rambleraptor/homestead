'use client';

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { OmniboxParseResponse } from '@/shared/omnibox/types';

export function useOmniboxParse() {
  return useMutation({
    mutationFn: async (query: string): Promise<OmniboxParseResponse> => {
      const res = await fetch('/api/omnibox/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aepbase.authStore.token}`,
          'X-User-Id': aepbase.getCurrentUser()?.id || '',
        },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`omnibox parse failed: HTTP ${res.status}`);
      return res.json();
    },
    onError: (err) => logger.error('Omnibox parse error', err),
  });
}
