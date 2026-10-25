/**
 * Tests for the DashboardHome greeting, which switches between a first-run
 * "Welcome" and a returning "Welcome back" based on the welcome-guide setting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DashboardHome } from '../DashboardHome';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { getTodaysHoliday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { getAppById } from '@rambleraptor/homestead-core/apps/registry';

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
  AgenticHome: ({ conversationId }: { conversationId: string | null }) => (
    <div data-testid="agentic-home-stub" data-conversation={conversationId ?? ''} />
  ),
}));

// The server has an AI provider configured (`GET /api/chat`).
vi.mock('@rambleraptor/homestead-core/chat/hooks/useAiConfigured', () => ({
  useAiConfigured: vi.fn(() => true),
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
  return {
    ...actual,
    getAllDashboardWidgets: vi.fn(() => []),
    // Chat is installed (and, per the visibility mock, usable).
    getAppById: vi.fn((id: string) => (id === 'chat' ? { id: 'chat' } : undefined)),
  };
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

describe('DashboardHome falls back to the classic home', () => {
  beforeEach(() => {
    mockShowGuide(false);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Alex', type: 'regular' } } as never);
    vi.mocked(useAppFlag).mockReturnValue({ value: true } as never);
    vi.mocked(useAiConfigured).mockReturnValue(true);
  });

  it('when no AI provider is configured', () => {
    vi.mocked(useAiConfigured).mockReturnValue(false);
    renderHome();
    expect(screen.queryByTestId('agentic-home-stub')).toBeNull();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it("when the person can't use Chat", () => {
    vi.mocked(getAppById).mockReturnValueOnce(undefined);
    renderHome();
    expect(screen.queryByTestId('agentic-home-stub')).toBeNull();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it('shows neither home while it asks whether the assistant is configured', () => {
    vi.mocked(useAiConfigured).mockReturnValue(undefined);
    const { container } = renderHome();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DashboardHome conversation address', () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard/c/:id" element={<DashboardHome params={{ id: 'conv-1' }} />} />
          <Route path="/chat/:id" element={<div data-testid="chat-screen-stub" />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    mockShowGuide(false);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Alex', type: 'regular' } } as never);
    vi.mocked(useAiConfigured).mockReturnValue(true);
  });

  it('opens that conversation on the agentic home', () => {
    vi.mocked(useAppFlag).mockReturnValue({ value: true } as never);
    renderAt('/dashboard/c/conv-1');
    expect(screen.getByTestId('agentic-home-stub')).toHaveAttribute('data-conversation', 'conv-1');
  });

  it('waits for the flag before deciding, so a reload never bounces to Chat', () => {
    vi.mocked(useAppFlag).mockReturnValue({ value: false, isLoading: true } as never);
    renderAt('/dashboard/c/conv-1');
    expect(screen.queryByTestId('chat-screen-stub')).toBeNull();
    expect(screen.queryByTestId('agentic-home-stub')).toBeNull();
  });

  it('sends it to the Chat screen for someone on the classic home', () => {
    vi.mocked(useAppFlag).mockReturnValue({ value: false } as never);
    renderAt('/dashboard/c/conv-1');
    expect(screen.getByTestId('chat-screen-stub')).toBeInTheDocument();
  });
});
