/**
 * AppShell chrome: the sidebar and header render normally and are left out
 * in chromeless mode (`?chrome=none`). The chrome components themselves are
 * stubbed — their behavior has its own tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../AppShell';
import { useFillPage } from '../pageFill';

vi.mock('../Sidebar', () => ({ Sidebar: () => <nav data-testid="sidebar" /> }));
vi.mock('../Header', () => ({ Header: () => <header data-testid="header" /> }));
vi.mock('../ViewAsBanner', () => ({ ViewAsBanner: () => null }));
vi.mock('../../shared/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
vi.mock('../../shared/pwa', () => ({ useHomeScreenIcon: () => {} }));
vi.mock('../../shared/useBuildReload', () => ({ useBuildReload: () => {} }));
vi.mock('../../auth/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <p>page content</p>
      </AppShell>
    </MemoryRouter>,
  );
}

function FillingPage() {
  useFillPage();
  return <p>canvas</p>;
}

describe('AppShell', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('lets a page fill the main area, and pads again once it leaves', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell>
          <FillingPage />
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('data-fill', 'true');

    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell>
          <p>page content</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).not.toHaveAttribute('data-fill');
  });

  it('renders the sidebar and header by default', () => {
    renderAt('/todos');
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).not.toHaveAttribute('data-chromeless');
  });

  it('leaves both out in chromeless mode', () => {
    renderAt('/todos?chrome=none');
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-chromeless', 'true');
  });
});
