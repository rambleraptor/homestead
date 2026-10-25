import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssistantAvailability } from '../home';
import { partOfDay } from '../greeting';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { getAppById } from '@rambleraptor/homestead-core/apps/registry';

let visible = true;
vi.mock('@rambleraptor/homestead-core/chat/hooks/useAiConfigured', () => ({
  useAiConfigured: vi.fn(() => true),
}));
vi.mock('@rambleraptor/homestead-core/apps/useAppVisibility', () => ({
  useAppVisible: () => () => visible,
}));
vi.mock('@rambleraptor/homestead-core/apps/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rambleraptor/homestead-core/apps/registry')>()),
  getAppById: vi.fn((id: string) => (id === 'chat' ? { id: 'chat' } : undefined)),
}));

describe('useAssistantAvailability', () => {
  beforeEach(() => {
    visible = true;
    vi.mocked(useAiConfigured).mockReturnValue(true);
  });

  it('is available with an AI provider and access to Chat', () => {
    expect(renderHook(() => useAssistantAvailability()).result.current).toBe('available');
  });

  it('is not configured without an AI provider', () => {
    vi.mocked(useAiConfigured).mockReturnValue(false);
    expect(renderHook(() => useAssistantAvailability()).result.current).toBe('not-configured');
  });

  it("is out of reach for someone who can't use Chat, whatever the server says", () => {
    visible = false;
    vi.mocked(useAiConfigured).mockReturnValue(undefined);
    expect(renderHook(() => useAssistantAvailability()).result.current).toBe('no-access');
  });

  it('is unknown while the server is still asked', () => {
    vi.mocked(useAiConfigured).mockReturnValue(undefined);
    expect(renderHook(() => useAssistantAvailability()).result.current).toBeUndefined();
  });

  it("is out of reach when Chat isn't installed", () => {
    vi.mocked(getAppById).mockReturnValueOnce(undefined);
    expect(renderHook(() => useAssistantAvailability()).result.current).toBe('no-access');
  });
});

describe('partOfDay', () => {
  it('greets by the local hour', () => {
    expect(partOfDay(new Date(2026, 9, 25, 8))).toBe('Good morning');
    expect(partOfDay(new Date(2026, 9, 25, 12))).toBe('Good afternoon');
    expect(partOfDay(new Date(2026, 9, 25, 17, 59))).toBe('Good afternoon');
    expect(partOfDay(new Date(2026, 9, 25, 18))).toBe('Good evening');
  });
});
