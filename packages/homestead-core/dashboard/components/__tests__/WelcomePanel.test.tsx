/**
 * Tests for the first-login WelcomePanel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { WelcomePanel } from '../WelcomePanel';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import {
  getAppById,
  getNavigationApps,
} from '@rambleraptor/homestead-core/apps/registry';

vi.mock('@rambleraptor/homestead-core/user-settings/hooks/useUserSetting', () => ({
  useUserSetting: vi.fn(),
}));

vi.mock('@rambleraptor/homestead-core/apps/useAppVisibility', () => ({
  useAppVisible: vi.fn(() => () => true),
}));

// Preserve the real registry (the test bootstrap calls initializeAppRegistry)
// and only stub the two lookups the panel uses.
vi.mock('@rambleraptor/homestead-core/apps/registry', async (importActual) => {
  const actual =
    await importActual<
      typeof import('@rambleraptor/homestead-core/apps/registry')
    >();
  return { ...actual, getAppById: vi.fn(), getNavigationApps: vi.fn(() => []) };
});

const setValue = vi.fn(async () => {});

function mockSetting(overrides: Partial<ReturnType<typeof useUserSetting>> = {}) {
  vi.mocked(useUserSetting).mockReturnValue({
    value: true,
    setValue,
    isLoading: false,
    isSaving: false,
    error: null,
    ...overrides,
  });
}

function app(id: string, name: string, basePath: string): AppConfig {
  return { id, name, web: { basePath, routes: [] } } as AppConfig;
}

describe('WelcomePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppVisible).mockReturnValue(() => true);
    vi.mocked(getNavigationApps).mockReturnValue([]);
    vi.mocked(getAppById).mockReturnValue(undefined);
  });

  const renderPanel = () =>
    render(
      <MemoryRouter>
        <WelcomePanel />
      </MemoryRouter>,
    );

  it('renders the guide when the setting is on', () => {
    mockSetting({ value: true });
    renderPanel();
    expect(screen.getByTestId('welcome-panel')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Homestead')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-dismiss')).toBeInTheDocument();
  });

  it('renders nothing once the guide has been dismissed', () => {
    mockSetting({ value: false });
    renderPanel();
    expect(screen.queryByTestId('welcome-panel')).toBeNull();
  });

  it('renders nothing while the setting is still loading', () => {
    mockSetting({ value: undefined, isLoading: true });
    renderPanel();
    expect(screen.queryByTestId('welcome-panel')).toBeNull();
  });

  it('flips the setting off when dismissed', async () => {
    mockSetting({ value: true });
    renderPanel();
    await userEvent.click(screen.getByTestId('welcome-dismiss'));
    expect(setValue).toHaveBeenCalledWith(false);
  });

  it('links to visible apps only', () => {
    mockSetting({ value: true });
    vi.mocked(getNavigationApps).mockReturnValue([
      app('recipes', 'Recipes', '/recipes'),
    ]);
    vi.mocked(getAppById).mockImplementation((id: string) =>
      id === 'settings' ? app('settings', 'Settings', '/settings') : undefined,
    );

    renderPanel();

    expect(screen.getByTestId('welcome-link-explore')).toHaveAttribute(
      'href',
      '/recipes',
    );
    expect(screen.getByTestId('welcome-link-settings')).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('omits links to apps the viewer cannot see', () => {
    mockSetting({ value: true });
    vi.mocked(useAppVisible).mockReturnValue(() => false);
    vi.mocked(getNavigationApps).mockReturnValue([
      app('recipes', 'Recipes', '/recipes'),
    ]);
    vi.mocked(getAppById).mockImplementation(() => app('settings', 'Settings', '/settings'));

    renderPanel();

    expect(screen.queryByTestId('welcome-link-explore')).toBeNull();
    expect(screen.queryByTestId('welcome-link-settings')).toBeNull();
  });
});
