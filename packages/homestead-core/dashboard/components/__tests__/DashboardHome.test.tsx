/**
 * Tests for the DashboardHome greeting, which switches between a first-run
 * "Welcome" and a returning "Welcome back" based on the welcome-guide setting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from '../DashboardHome';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { getTodaysHoliday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';

vi.mock('../WelcomePanel', () => ({
  WelcomePanel: () => <div data-testid="welcome-panel-stub" />,
}));

vi.mock('../AdminChecklistPanel', () => ({
  AdminChecklistPanel: () => <div data-testid="admin-checklist-stub" />,
}));

vi.mock('../NoAppsPanel', () => ({
  NoAppsPanel: () => <div data-testid="no-apps-stub" />,
}));

vi.mock('../agentic/AgenticHome', () => ({
  AgenticHome: () => <div data-testid="agentic-home-stub" />,
}));

// The agentic-home flag, as it resolves for the signed-in person (off here).
vi.mock('@rambleraptor/homestead-core/settings/hooks/useAppFlag', () => ({
  useAppFlag: vi.fn(() => ({ value: false })),
}));

vi.mock('@rambleraptor/homestead-core/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@rambleraptor/homestead-core/user-settings/hooks/useUserSetting', () => ({
  useUserSetting: vi.fn(),
}));

vi.mock('@rambleraptor/homestead-core/shared/utils/dateUtils', () => ({
  getTodaysHoliday: vi.fn(() => null),
}));

vi.mock('@rambleraptor/homestead-core/apps/useAppVisibility', () => ({
  useAppVisible: () => () => true,
}));

vi.mock('@rambleraptor/homestead-core/apps/registry', async (importActual) => {
  const actual =
    await importActual<
      typeof import('@rambleraptor/homestead-core/apps/registry')
    >();
  return { ...actual, getAllDashboardWidgets: vi.fn(() => []), getAppById: vi.fn() };
});

function mockShowGuide(value: boolean | undefined) {
  vi.mocked(useUserSetting).mockReturnValue({
    value,
    setValue: vi.fn(async () => {}),
    isLoading: false,
    isSaving: false,
    error: null,
  });
}

const renderHome = () =>
  render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );

describe('DashboardHome greeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Test User' },
    } as ReturnType<typeof useAuth>);
    vi.mocked(getTodaysHoliday).mockReturnValue(null);
  });

  it('greets a first-run user with "Welcome" (not "Welcome back")', () => {
    mockShowGuide(true);
    renderHome();
    expect(screen.getByText('Welcome, Test User')).toBeInTheDocument();
    expect(screen.queryByText(/Welcome back/)).toBeNull();
  });

  it('greets a returning user with "Welcome back"', () => {
    mockShowGuide(false);
    renderHome();
    expect(screen.getByText('Welcome back, Test User')).toBeInTheDocument();
  });

  it('lets a holiday message override the greeting', () => {
    mockShowGuide(true);
    vi.mocked(getTodaysHoliday).mockReturnValue({
      message: 'Happy New Year!',
    } as ReturnType<typeof getTodaysHoliday>);
    renderHome();
    expect(screen.getByText('Happy New Year!')).toBeInTheDocument();
    expect(screen.queryByText(/Welcome/)).toBeNull();
  });
});

describe('DashboardHome onboarding panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTodaysHoliday).mockReturnValue(null);
    mockShowGuide(true);
  });

  it('shows the admin checklist to a superuser', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Admin', type: 'superuser' },
    } as ReturnType<typeof useAuth>);
    renderHome();
    expect(screen.getByTestId('admin-checklist-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-panel-stub')).toBeNull();
  });

  it('shows the welcome guide to a regular user', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Sam', type: 'regular' },
    } as ReturnType<typeof useAuth>);
    renderHome();
    expect(screen.getByTestId('welcome-panel-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-checklist-stub')).toBeNull();
  });
});

describe('DashboardHome agentic flag', () => {
  it('shows the agentic home when the flag is on for this person, and the classic one otherwise', () => {
    mockShowGuide(false);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Alex', type: 'regular' } } as never);

    vi.mocked(useAppFlag).mockReturnValue({ value: true } as never);
    const on = renderHome();
    expect(on.getByTestId('agentic-home-stub')).toBeInTheDocument();
    on.unmount();

    vi.mocked(useAppFlag).mockReturnValue({ value: false } as never);
    renderHome();
    expect(screen.queryByTestId('agentic-home-stub')).not.toBeInTheDocument();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });
});
