/**
 * The home with and without the assistant: the conversation when it can serve
 * the person, a note saying why when it can't, and the setup panels above a
 * new conversation. Rendering of the chips is covered by the VM specs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AgenticHome } from '../AgenticHome';
import { useAssistantAvailability } from '../../../home';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';

vi.mock('../../../home', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../home')>()),
  useAssistantAvailability: vi.fn(() => 'available'),
}));
vi.mock('@rambleraptor/homestead-core/auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@rambleraptor/homestead-core/apps/useAppVisibility', () => ({
  useAppVisible: () => () => true,
}));
vi.mock('@rambleraptor/homestead-core/apps/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rambleraptor/homestead-core/apps/registry')>()),
  getAllDashboardWidgets: () => [],
}));
vi.mock('@rambleraptor/homestead-core/shared/utils/dateUtils', () => ({
  getTodaysHoliday: () => null,
}));
vi.mock('@rambleraptor/homestead-core/chat/hooks/useConversation', () => ({
  useConversation: () => ({ messages: [] }),
}));
vi.mock('@rambleraptor/homestead-core/chat/components/ChatThread', () => ({
  ChatThread: () => <div data-testid="thread-stub" />,
}));
vi.mock('../../AdminChecklistPanel', () => ({
  AdminChecklistPanel: () => <div data-testid="checklist-stub" />,
}));
vi.mock('../../NoAppsPanel', () => ({ NoAppsPanel: () => null }));

const renderHome = (conversationId: string | null = null) =>
  render(
    <MemoryRouter initialEntries={[conversationId ? `/dashboard/c/${conversationId}` : '/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<AgenticHome conversationId={null} />} />
        <Route path="/dashboard/c/:id" element={<AgenticHome conversationId={conversationId} />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Alex', type: 'regular' } } as never);
  vi.mocked(useAssistantAvailability).mockReturnValue('available');
});

describe('AgenticHome', () => {
  it('holds the conversation, with past ones a tap away, when the assistant can serve', () => {
    renderHome();
    expect(screen.getByTestId('thread-stub')).toBeInTheDocument();
    expect(screen.getByTestId('agentic-history')).toBeInTheDocument();
    expect(screen.queryByTestId('home-assistant-unavailable')).toBeNull();
  });

  it.each([
    ['not-configured', /isn't set up/],
    ['no-access', /isn't one of your apps/],
  ] as const)('says why the assistant is missing (%s), and keeps the rest', (reason, text) => {
    vi.mocked(useAssistantAvailability).mockReturnValue(reason);
    renderHome();
    const note = screen.getByTestId('home-assistant-unavailable');
    expect(note).toHaveAttribute('data-reason', reason);
    expect(note).toHaveTextContent(text);
    expect(screen.queryByTestId('thread-stub')).toBeNull();
    expect(screen.queryByTestId('agentic-history')).toBeNull();
  });

  it('shows neither while it asks the server', () => {
    vi.mocked(useAssistantAvailability).mockReturnValue(undefined);
    renderHome();
    expect(screen.queryByTestId('thread-stub')).toBeNull();
    expect(screen.queryByTestId('home-assistant-unavailable')).toBeNull();
  });

  it('sends a conversation address to the plain home when there is no assistant', () => {
    vi.mocked(useAssistantAvailability).mockReturnValue('not-configured');
    renderHome('conv-1');
    expect(screen.getByTestId('home-assistant-unavailable')).toBeInTheDocument();
  });

  it('shows an admin the setup checklist above a new conversation, not an open one', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'a1', name: 'Admin', type: 'superuser' } } as never);
    const fresh = renderHome();
    expect(screen.getByTestId('checklist-stub')).toBeInTheDocument();
    fresh.unmount();

    renderHome('conv-1');
    expect(screen.queryByTestId('checklist-stub')).toBeNull();
  });

  it('shows no checklist to a regular member', () => {
    renderHome();
    expect(screen.queryByTestId('checklist-stub')).toBeNull();
  });
});
