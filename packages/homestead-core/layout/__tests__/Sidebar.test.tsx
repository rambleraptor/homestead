/**
 * `<Sidebar>` visibility: the mobile drawer slides in on `isOpen`, and the
 * desktop breakpoint can be hidden entirely via `desktopHidden`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { useAuth } from '../../auth/useAuth';

vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));
// The nav list is the pins hook's business (and needs a QueryClient for the
// household defaults flag); this test is about the chrome around it.
vi.mock('@rambleraptor/homestead-core/apps/useSidebarPins', () => ({
  useSidebarPins: () => ({
    entries: [],
    pinnedEntries: [],
    states: new Map(),
    defaultIds: new Set(),
    defaultOverrides: {},
  }),
}));

function renderSidebar(props: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar isOpen={false} onClose={() => undefined} {...props} />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'a@example.com' },
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('stays visible at the desktop breakpoint by default', () => {
    renderSidebar();
    const aside = screen.getByTestId('app-sidebar');
    expect(aside.className).toContain('lg:translate-x-0');
    expect(aside.className).not.toContain('lg:hidden');
  });

  it('hides at the desktop breakpoint when desktopHidden is set', () => {
    renderSidebar({ desktopHidden: true });
    const aside = screen.getByTestId('app-sidebar');
    expect(aside.className).toContain('lg:hidden');
    expect(aside.className).not.toContain('lg:translate-x-0');
  });

  it('still opens as a mobile drawer while hidden on desktop', () => {
    renderSidebar({ desktopHidden: true, isOpen: true });
    const aside = screen.getByTestId('app-sidebar');
    expect(aside.className).toContain('translate-x-0');
    expect(aside.className).not.toContain('-translate-x-full');
  });
});
