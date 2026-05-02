/**
 * Tests for the page-level `<ModuleEnabledGate>` that hides a module's
 * content from disallowed viewers and redirects them to a fallback.
 * The hard work of resolving visibility lives in `useModuleFlag` +
 * `useAuth`; the gate just wires those together with a redirect.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ModuleEnabledGate } from '../ModuleEnabledGate';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useModuleFlag } from '@rambleraptor/homestead-core/settings/hooks/useModuleFlag';
import type { User } from '@rambleraptor/homestead-core/auth/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@rambleraptor/homestead-core/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@rambleraptor/homestead-core/settings/hooks/useModuleFlag', () => ({
  useModuleFlag: vi.fn(),
}));

const mockUser = (type: 'superuser' | 'regular'): User => ({
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1@example.com',
  name: 'U1',
  verified: true,
  created: '2024-01-01',
  updated: '2024-01-01',
  type,
});

const mockAuth = (user: User | null, isLoading = false) => {
  vi.mocked(useAuth).mockReturnValue({
    user,
    token: user ? 't' : null,
    isAuthenticated: user !== null,
    isLoading,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
};

const mockFlag = (value: string | undefined, isLoading = false) => {
  vi.mocked(useModuleFlag).mockReturnValue({
    value,
    setValue: vi.fn(),
    isLoading,
    isSaving: false,
    error: null,
  });
};

describe('ModuleEnabledGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the children when the viewer passes the enabled flag', () => {
    mockAuth(mockUser('regular'));
    mockFlag('all');

    render(
      <ModuleEnabledGate moduleId="minigolf">
        <div>protected</div>
      </ModuleEnabledGate>,
    );

    expect(screen.getByText('protected')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects regular users away from a 'superusers' module", async () => {
    mockAuth(mockUser('regular'));
    mockFlag('superusers');

    render(
      <ModuleEnabledGate moduleId="users">
        <div>protected</div>
      </ModuleEnabledGate>,
    );

    expect(screen.queryByText('protected')).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it("redirects everyone (even superusers) away from a 'none' module", async () => {
    mockAuth(mockUser('superuser'));
    mockFlag('none');

    render(
      <ModuleEnabledGate moduleId="bridge">
        <div>protected</div>
      </ModuleEnabledGate>,
    );

    expect(screen.queryByText('protected')).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('does not redirect while auth or flags are still loading', () => {
    mockAuth(null, true);
    mockFlag('all', true);

    render(
      <ModuleEnabledGate moduleId="minigolf">
        <div>protected</div>
      </ModuleEnabledGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('honors a custom fallback path', async () => {
    mockAuth(mockUser('regular'));
    mockFlag('none');

    render(
      <ModuleEnabledGate moduleId="bridge" fallbackPath="/games">
        <div>protected</div>
      </ModuleEnabledGate>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/games'));
  });
});
