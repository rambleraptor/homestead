/**
 * Tests for the admin post-claim getting-started checklist.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AdminChecklistPanel } from '../AdminChecklistPanel';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { useUsers } from '@rambleraptor/homestead-core/superuser/users/hooks/useUsers';
import type { ManagedUser } from '@rambleraptor/homestead-core/superuser/users/types';

vi.mock('@rambleraptor/homestead-core/user-settings/hooks/useUserSetting', () => ({
  useUserSetting: vi.fn(),
}));

vi.mock('@rambleraptor/homestead-core/superuser/users/hooks/useUsers', () => ({
  useUsers: vi.fn(),
}));

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

function mockUsers(count: number) {
  const data = Array.from({ length: count }, (_, i) => ({
    id: `u${i}`,
    email: `u${i}@home.dev`,
  })) as ManagedUser[];
  vi.mocked(useUsers).mockReturnValue({ data } as ReturnType<typeof useUsers>);
}

function mockAi(configured: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ configured }), { status: 200 })),
  );
}

function renderPanel(ui: ReactNode = <AdminChecklistPanel />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminChecklistPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetting();
    mockUsers(1);
    mockAi(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing once dismissed', () => {
    mockSetting({ value: false });
    renderPanel();
    expect(screen.queryByTestId('admin-checklist')).toBeNull();
  });

  it('renders nothing while the setting is loading', () => {
    mockSetting({ value: undefined, isLoading: true });
    renderPanel();
    expect(screen.queryByTestId('admin-checklist')).toBeNull();
  });

  it('shows both steps incomplete for a fresh, AI-less instance', async () => {
    mockUsers(1);
    mockAi(false);
    renderPanel();

    expect(await screen.findByTestId('admin-checklist')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('admin-checklist-progress')).toHaveTextContent(
        '0 of 2 done',
      ),
    );
    // The AI step links to the key's place in Credentials when unconfigured.
    expect(screen.getByTestId('checklist-link-ai')).toHaveAttribute('href', '/superuser/credentials');
    expect(screen.getByTestId('checklist-link-ai')).toHaveTextContent('Set the AI key');
    // Members step links to the Users admin.
    expect(screen.getByTestId('checklist-link-members')).toHaveAttribute(
      'href',
      '/superuser/users',
    );
    expect(screen.getByTestId('admin-checklist-dismiss')).toHaveTextContent(
      /dismiss/i,
    );
  });

  it('checks off steps as household + AI are set up', async () => {
    mockUsers(3);
    mockAi(true);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId('admin-checklist-progress')).toHaveTextContent(
        '2 of 2 done',
      ),
    );
    // AI configured → nothing to open: the assistant is on the home itself.
    expect(screen.queryByTestId('checklist-link-ai')).toBeNull();
    // All done → the dismiss button reads "Done".
    expect(screen.getByTestId('admin-checklist-dismiss')).toHaveTextContent(
      /done/i,
    );
  });

  it('dismisses the checklist', async () => {
    renderPanel();
    await userEvent.click(await screen.findByTestId('admin-checklist-dismiss'));
    expect(setValue).toHaveBeenCalledWith(false);
  });
});
