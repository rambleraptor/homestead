/**
 * Tests for `useModuleFlagsDefinition` — the Flag Management page
 * sources its flag list exclusively from aepbase's `module-flag`
 * resource definition. The parser has to convert the schema properties
 * (which bake enum options + declared defaults into the description
 * text because aepbase strips those JSON-schema fields on round-trip)
 * back into a `ModuleFlagDefs` tree.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { useModuleFlagsDefinition } from '../useModuleFlagsDefinition';

const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('useModuleFlagsDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the resource as missing when aepbase 404s', async () => {
    vi.mocked(aepbase.get).mockRejectedValue(
      new AepbaseError(404, 'not found', '/aep-resource-definitions/module-flag'),
    );

    const { result } = renderHook(() => useModuleFlagsDefinition(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isMissing).toBe(true);
    expect(result.current.defs).toEqual({});
  });

  it('parses enum flags with defaults out of the description', async () => {
    vi.mocked(aepbase.get).mockResolvedValue({
      schema: {
        properties: {
          settings__omnibox_access: {
            type: 'string',
            description:
              'Who can use the omnibox. (default: superuser) (one of: superuser, all)',
          },
        },
      },
    });

    const { result } = renderHook(() => useModuleFlagsDefinition(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isMissing).toBe(false);
    expect(result.current.defs.settings.omnibox_access).toEqual({
      type: 'enum',
      label: 'Omnibox access',
      description: 'Who can use the omnibox.',
      options: ['superuser', 'all'],
      default: 'superuser',
    });
  });

  it('parses primitive flag types and coerces the default to the declared type', async () => {
    vi.mocked(aepbase.get).mockResolvedValue({
      schema: {
        properties: {
          gift_cards__show_archived: {
            type: 'boolean',
            description: 'Show archived gift cards. (default: false)',
          },
          groceries__refill_threshold: {
            type: 'number',
            description: 'How many items trigger a refill reminder. (default: 3)',
          },
        },
      },
    });

    const { result } = renderHook(() => useModuleFlagsDefinition(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.defs['gift-cards'].show_archived).toEqual({
      type: 'boolean',
      label: 'Show archived',
      description: 'Show archived gift cards.',
      default: false,
    });
    expect(result.current.defs.groceries.refill_threshold).toEqual({
      type: 'number',
      label: 'Refill threshold',
      description: 'How many items trigger a refill reminder.',
      default: 3,
    });
  });
});
